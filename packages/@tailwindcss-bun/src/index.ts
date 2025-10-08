import { compile, env, Features, Instrumentation, normalizePath, optimize } from '@tailwindcss/node'
import { clearRequireCache } from '@tailwindcss/node/require-cache'
import { napiModule, Scanner, twctxCreate, twctxIsDirty, twctxToJs } from '@tailwindcss/oxide'
import type { BunPlugin } from 'bun'
import fs from 'node:fs/promises'
import path from 'node:path'

const DEBUG = env.DEBUG
const SPECIAL_QUERY_RE = /[?&](?:worker|sharedworker|raw|url)\b/
const COMMON_JS_PROXY_RE = /\?commonjs-proxy/
const INLINE_STYLE_ID_RE = /[?&]index\=\d+\.css$/

// Filter for non-CSS files that should be scanned for candidates
const NON_CSS_ROOT_FILE_RE =
  /(?:\/\.bun\/|(?!\.css$|\.vue\?.*&lang\.css|\.astro\?.*&lang\.css|\.svelte\?.*&lang\.css).*|\?(?:raw|url)\b)/

const addon = napiModule

export const isWindows = typeof process !== 'undefined' && process.platform === 'win32'

const plugin: BunPlugin = {
  name: '@tailwindcss/bun',
  setup(build) {
    const projectRoot = normalizePath(build.config?.root ?? process.cwd())
    // Create external state for native plugin to share candidates
    const external = twctxCreate()

    let moduleGraphCandidates = new Map<string, Set<string>>()
    function getSharedCandidates() {
      if (twctxIsDirty(external)) {
        let rawCandidates: Array<{ id: string; candidates: string[] }> = twctxToJs(external)
        for (let { id, candidates } of rawCandidates) {
          moduleGraphCandidates.set(id, new Set(candidates))
        }
      }
      return moduleGraphCandidates
    }

    // Map to store Root instances per CSS file
    let roots: Map<string, Root> = new Map()

    // Step 1: Register native plugin to scan source files for candidates
    // @ts-ignore - onBeforeParse is not in BunPlugin types yet
    build.onBeforeParse(
      { filter: NON_CSS_ROOT_FILE_RE },
      { napiModule: addon, symbol: 'tw_on_before_parse', external },
    )

    // Step 2: Generate CSS when loading .css files
    build.onLoad({ filter: /\.css$/ }, async ({ defer, path: inputPath }) => {
      if (!isPotentialCssRootFile(inputPath)) return

      using I = new Instrumentation()
      DEBUG && I.start('[@tailwindcss/bun] Generate CSS')

      // Get or create Root instance for this CSS file
      let root = roots.get(inputPath)
      if (!root) {
        root = new Root(inputPath, projectRoot)
        roots.set(inputPath, root)
      }

      let sourceContents = await Bun.file(inputPath).text()

      // Wait until the native plugin has scanned all files in the module graph
      await defer()

      let result = await root.generate(sourceContents, () => getSharedCandidates(), I)

      if (!result) {
        roots.delete(inputPath)
        DEBUG && I.end('[@tailwindcss/bun] Generate CSS')
        return undefined
      }

      DEBUG && I.end('[@tailwindcss/bun] Generate CSS')

      const doOptimization = false

      // Bun already optimizes CSS code
      if (!doOptimization)
        return {
          contents: result.code,
          loader: 'css',
        }

      // Optimize the CSS (minification, etc.)
      DEBUG && I.start('[@tailwindcss/bun] Optimize CSS')
      let optimized = optimize(result.code, {
        minify: true,
        map: undefined,
      })
      DEBUG && I.end('[@tailwindcss/bun] Optimize CSS')

      return {
        contents: optimized.code,
        loader: 'css',
      }
    })
  },
}

export default plugin

function getExtension(id: string) {
  let [filename] = id.split('?', 2)
  return path.extname(filename).slice(1)
}

function isPotentialCssRootFile(id: string) {
  if (id.includes('/.bun/')) return false
  let extension = getExtension(id)
  let isCssFile =
    (extension === 'css' || id.includes('&lang.css') || id.match(INLINE_STYLE_ID_RE)) &&
    // Don't intercept special static asset resources
    !SPECIAL_QUERY_RE.test(id) &&
    !COMMON_JS_PROXY_RE.test(id)
  return isCssFile
}

function idToPath(id: string) {
  return path.resolve(id.replace(/\?.*$/, ''))
}

class Root {
  // The lazily-initialized Tailwind compiler components. These are persisted
  // throughout rebuilds but will be re-initialized if the rebuild strategy is
  // set to `full`.
  private compiler?: Awaited<ReturnType<typeof compile>>

  // The lazily-initialized Tailwind scanner.
  private scanner?: Scanner

  // List of all candidates that were being returned by the root scanner during
  // the lifetime of the root.
  private candidates: Set<string> = new Set<string>()

  // TODO: this is not needed for Bun plugin, need to verify though for the dev server
  // List of all build dependencies (e.g. imported stylesheets or plugins) and
  // their last modification timestamp. If no mtime can be found, we need to
  // assume the file has always changed.
  private buildDependencies = new Map<string, number | null>()

  constructor(
    private id: string,
    private base: string,
  ) {}

  // Generate the CSS for the root file. This can return false if the file is
  // not considered a Tailwind root. When this happened, the root can be GCed.
  public async generate(
    content: string,
    getSharedCandidates: () => Map<string, Set<string>>,
    I: Instrumentation,
  ): Promise<
    | {
        code: string
      }
    | false
  > {
    let inputPath = idToPath(this.id)
    let inputBase = path.dirname(path.resolve(inputPath))

    let requiresBuildPromise = this.requiresBuild()

    if (!this.compiler || !this.scanner || (await requiresBuildPromise)) {
      clearRequireCache(Array.from(this.buildDependencies.keys()))
      this.buildDependencies.clear()

      await this.addBuildDependency(idToPath(inputPath))

      DEBUG && I.start('Setup compiler')
      let addBuildDependenciesPromises: Promise<void>[] = []
      this.compiler = await compile(content, {
        base: inputBase,
        shouldRewriteUrls: true,
        onDependency: (path) => {
          // Note: Bun does not currently have a bundler API which is
          // analogous to `.addWatchFile()`, but we track dependencies
          // for cache invalidation
          addBuildDependenciesPromises.push(this.addBuildDependency(path))
        },
      })
      await Promise.all(addBuildDependenciesPromises)
      DEBUG && I.end('Setup compiler')

      DEBUG && I.start('Setup scanner')

      let sources = (() => {
        // Disable auto source detection
        if (this.compiler.root === 'none') {
          return []
        }

        if (this.compiler.root === null) {
          return [{ base: this.base, pattern: '**/*', negated: false }]
        }

        // Use the specified root
        return [{ ...this.compiler.root, negated: false }]
      })().concat(this.compiler.sources)

      this.scanner = new Scanner({ sources })
      DEBUG && I.end('Setup scanner')
    }

    if (
      !(
        this.compiler.features &
        (Features.AtApply | Features.JsPluginCompat | Features.ThemeFunction | Features.Utilities)
      )
    ) {
      return false
    }

    if (this.compiler.features & Features.Utilities) {
      DEBUG && I.start('Scan for candidates')
      for (let candidate of this.scanner.scan()) {
        this.candidates.add(candidate)
      }
      DEBUG && I.end('Scan for candidates')

      // Validate root path if specified
      let root = this.compiler.root
      if (root !== 'none' && root !== null) {
        let basePath = normalizePath(path.resolve(root.base, root.pattern))

        let isDir = await fs.stat(basePath).then(
          (stats) => stats.isDirectory(),
          () => false,
        )

        if (!isDir) {
          throw new Error(
            `The path given to \`source(…)\` must be a directory but got \`source(${basePath})\` instead.`,
          )
        }
      }
    }

    // Merge candidates from the file system scanner with those from the module graph
    DEBUG && I.start('Merge module graph candidates')
    let allCandidates = new Set(this.candidates)
    let sharedCandidates = this.getModuleGraphCandidates(getSharedCandidates())
    for (let candidate of sharedCandidates) {
      allCandidates.add(candidate)
    }
    DEBUG && I.end('Merge module graph candidates')

    DEBUG && I.start('Build CSS')
    let code = this.compiler.build([...allCandidates])
    DEBUG && I.end('Build CSS')

    return {
      code,
    }
  }

  private getModuleGraphCandidates(sharedCandidates: Map<string, Set<string>>): Set<string> {
    if (this.compiler?.root === 'none') return new Set()

    const HAS_DRIVE_LETTER = /^[A-Z]:/

    let basePath: string | null = null
    let root = this.compiler?.root

    if (root !== null && root !== undefined) {
      basePath = normalizePath(path.resolve(root.base, root.pattern))
    }

    let shouldIncludeCandidatesFrom = (id: string) => {
      if (basePath === null) return true

      if (id.startsWith(basePath)) return true

      // This is a windows absolute path that doesn't match so return false
      if (HAS_DRIVE_LETTER.test(id)) return false

      // We've got a path that's not absolute and not on Windows
      // TODO: this is probably a virtual module -- not sure if we need to scan it
      if (!id.startsWith('/')) return true

      // This is an absolute path on POSIX and it does not match
      return false
    }

    let merged = new Set<string>()

    for (let [id, candidates] of sharedCandidates) {
      if (!shouldIncludeCandidatesFrom(id)) continue

      for (let candidate of candidates) {
        merged.add(candidate)
      }
    }

    return merged
  }

  private async addBuildDependency(path: string) {
    let mtime: number | null = null
    try {
      mtime = (await fs.stat(path)).mtimeMs
    } catch {}
    this.buildDependencies.set(path, mtime)
  }

  private async requiresBuild(): Promise<boolean> {
    for (let [path, mtime] of this.buildDependencies) {
      if (mtime === null) return true
      try {
        let stat = await fs.stat(path)
        if (stat.mtimeMs > mtime) {
          return true
        }
      } catch {
        return true
      }
    }
    return false
  }
}
