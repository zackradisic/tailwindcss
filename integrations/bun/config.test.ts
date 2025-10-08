import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe } from 'vitest'
import { candidate, css, html, js, json, test, ts, yaml } from '../utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Bun plugin', () => {
  test(
    'important selector',
    {
      fs: {
        'package.json': json`{}`,
        'pnpm-workspace.yaml': yaml`
          #
          packages:
            - project-a
        `,
        'project-a/package.json': json`
          {
            "type": "module",
            "dependencies": {
              "@tailwindcss/bun": "workspace:^",
              "tailwindcss": "workspace:^"
            }
          }
        `,
        'project-a/build.ts': ts`
          import plugin from '@tailwindcss/bun'

          const result = await Bun.build({
            entrypoints: ['./index.ts'],
            outdir: './dist',
            plugins: [plugin],
          })

          if (!result.success) {
            console.error('Build failed')
            for (const message of result.logs) {
              console.error(message)
            }
            process.exit(1)
          }
        `,
        'project-a/index.html': html`
          <div id="app">
            <div class="text-red-500 font-bold">Important text</div>
          </div>
        `,
        'project-a/index.ts': ts` import './src/index.css' `,
        'project-a/tailwind.config.js': js`
          export default {
            important: '#app',
            content: ['./index.html'],
          }
        `,
        'project-a/src/index.css': css`
          @import 'tailwindcss/theme';
          @import 'tailwindcss/utilities';
          @config '../tailwind.config.js';
        `,
      },
    },
    async ({ root, fs, exec, expect }) => {
      await exec('bun run build.ts', { cwd: path.join(root, 'project-a') })

      let files = await fs.glob('project-a/dist/**/*.css')
      expect(files).toHaveLength(1)
      let [filename, content] = files[0]

      // Check that styles are scoped with #app selector
      expect(content).toContain('#app .text-red-500')
      expect(content).toContain('#app .font-bold')
    },
  )

  test(
    'dark mode class strategy',
    {
      fs: {
        'package.json': json`{}`,
        'pnpm-workspace.yaml': yaml`
          #
          packages:
            - project-a
        `,
        'project-a/package.json': json`
          {
            "type": "module",
            "dependencies": {
              "@tailwindcss/bun": "workspace:^",
              "tailwindcss": "workspace:^"
            }
          }
        `,
        'project-a/build.ts': ts`
          import plugin from '@tailwindcss/bun'

          const result = await Bun.build({
            entrypoints: ['./index.ts'],
            outdir: './dist',
            plugins: [plugin],
          })

          if (!result.success) {
            console.error('Build failed')
            for (const message of result.logs) {
              console.error(message)
            }
            process.exit(1)
          }
        `,
        'project-a/index.html': html`
          <div class="bg-white dark:bg-gray-900">
            <h1 class="text-gray-900 dark:text-white">Dark mode text</h1>
          </div>
        `,
        'project-a/index.ts': ts` import './src/index.css' `,
        'project-a/tailwind.config.js': js`
          console.log('DARK MODE CONFIG LOADED!')
          export default {
            darkMode: 'class',
            content: ['./index.html'],
          }
        `,
        'project-a/src/index.css': css`
          @import 'tailwindcss/theme';
          @import 'tailwindcss/utilities';
          @config '../tailwind.config.js';
        `,
      },
    },
    async ({ root, fs, exec, expect }) => {
      await exec('bun run build.ts', { cwd: path.join(root, 'project-a') })

      let files = await fs.glob('project-a/dist/**/*.css')
      expect(files).toHaveLength(1)
      let [filename] = files[0]

      // Debug: Check what dark mode generates
      let content = await fs.read(filename)
      console.log('Dark mode CSS contains dark:?', content.includes('dark:'))
      console.log('First 500 chars:', content.substring(0, 500))

      await fs.expectFileToContain(filename, [
        candidate`bg-white`,
        candidate`dark:bg-gray-900`,
        candidate`text-gray-900`,
        candidate`dark:text-white`,
      ])
    },
  )

  test(
    'custom theme extend',
    {
      fs: {
        'package.json': json`{}`,
        'pnpm-workspace.yaml': yaml`
          #
          packages:
            - project-a
        `,
        'project-a/package.json': json`
          {
            "type": "module",
            "dependencies": {
              "@tailwindcss/bun": "workspace:^",
              "tailwindcss": "workspace:^"
            }
          }
        `,
        'project-a/build.ts': ts`
          import plugin from '@tailwindcss/bun'

          const result = await Bun.build({
            entrypoints: ['./index.ts'],
            outdir: './dist',
            plugins: [plugin],
          })

          if (!result.success) {
            console.error('Build failed')
            for (const message of result.logs) {
              console.error(message)
            }
            process.exit(1)
          }
        `,
        'project-a/index.html': html`
          <div class="text-brand bg-surface p-custom">
            Custom themed content
          </div>
        `,
        'project-a/index.ts': ts` import './src/index.css' `,
        'project-a/tailwind.config.js': js`
          export default {
            content: ['./index.html'],
            theme: {
              extend: {
                colors: {
                  brand: '#ff6600',
                  surface: '#f5f5f5',
                },
                spacing: {
                  custom: '3.5rem',
                },
              },
            },
          }
        `,
        'project-a/src/index.css': css`
          @import 'tailwindcss/theme';
          @import 'tailwindcss/utilities';
          @config '../tailwind.config.js';
        `,
      },
    },
    async ({ root, fs, exec, expect }) => {
      await exec('bun run build.ts', { cwd: path.join(root, 'project-a') })

      let files = await fs.glob('project-a/dist/**/*.css')
      expect(files).toHaveLength(1)
      let [filename, content] = files[0]

      // Check for custom color values (may be shortened)
      expect(content).toMatch(/#ff6600|#f60/)
      expect(content).toContain('#f5f5f5')

      // Check for custom spacing value
      expect(content).toContain('3.5rem')

      await fs.expectFileToContain(filename, [
        candidate`text-brand`,
        candidate`bg-surface`,
        candidate`p-custom`,
      ])
    },
  )
})
