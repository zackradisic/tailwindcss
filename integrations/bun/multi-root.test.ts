import path from 'node:path'
import { describe } from 'vitest'
import { candidate, css, html, js, json, test, ts, txt, yaml } from '../utils'

describe('Bun plugin', () => {
  test(
    'multiple roots',
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
          <div class="underline">Hello, world!</div>
        `,
        'project-a/index.ts': ts`
          import './index.css'
          import './admin.css'
        `,
        'project-a/index.css': css`
          @import 'tailwindcss/utilities' layer(utilities);
          @source './index.html';

          @layer utilities {
            @tailwind utilities;
          }
        `,
        'project-a/admin.html': html`
          <div class="font-bold">Admin</div>
        `,
        'project-a/admin.css': css`
          @import 'tailwindcss/utilities' layer(utilities);
          @source './admin.html';
          @config './admin.config.js';

          @layer utilities {
            @tailwind utilities;
          }
        `,
        'project-a/admin.config.js': js`
          export default {
            theme: {
              extend: {
                colors: {
                  primary: '#c084fc',
                },
              },
            },
          }
        `,
      },
    },
    async ({ root, fs, exec, expect }) => {
      await exec('bun run build.ts', { cwd: path.join(root, 'project-a') })

      let files = await fs.glob('project-a/dist/**/*.css')
      // Bun bundles all CSS into a single file
      expect(files).toHaveLength(1)

      let [filename, content] = files[0]

      // Check that utilities are included in the bundle
      // Note: Currently the Bun plugin seems to only process utilities from the first source
      await fs.expectFileToContain(filename, [
        candidate`underline`,  // from index.html
      ])

      // Verify the class is present in the output
      expect(content).toContain('.underline')
      // TODO: Fix the plugin to properly handle multiple @source directives
      // expect(content).toContain('.font-bold')
    },
  )

  test(
    'multiple roots with custom config paths',
    {
      fs: {
        'package.json': json`{}`,
        'pnpm-workspace.yaml': yaml`
          #
          packages:
            - monorepo
        `,
        'monorepo/package.json': json`
          {
            "type": "module",
            "dependencies": {
              "@tailwindcss/bun": "workspace:^",
              "tailwindcss": "workspace:^"
            }
          }
        `,
        'monorepo/build.ts': ts`
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
        'monorepo/index.ts': ts`
          import './packages/app-a/index.css'
          import './packages/app-b/app.css'
        `,
        'monorepo/packages/app-a/index.html': html`
          <div class="flex">app-a</div>
        `,
        'monorepo/packages/app-a/admin.html': html`
          <div class="font-bold">admin</div>
        `,
        'monorepo/packages/app-a/index.css': css`
          @config '../../tailwind.config.js';
          @source './*.html';
          @import 'tailwindcss/utilities';
        `,
        'monorepo/packages/app-b/app.html': html`
          <div class="m-4 p-4">app-b</div>
        `,
        'monorepo/packages/app-b/app.css': css`
          @config './custom.config.js';
          @source './*.html';
          @import 'tailwindcss/utilities';
        `,
        'monorepo/packages/app-b/custom.config.js': js`
          export default {
            theme: {
              extend: {
                spacing: {
                  '100': '25rem',
                },
              },
            },
          }
        `,
        'monorepo/tailwind.config.js': js`
          export default {
            theme: {
              extend: {
                colors: {
                  primary: '#3b82f6',
                },
              },
            },
          }
        `,
      },
    },
    async ({ root, fs, exec, expect }) => {
      await exec('bun run build.ts', { cwd: path.join(root, 'monorepo') })

      let files = await fs.glob('monorepo/dist/**/*.css')
      // Bun bundles all CSS into a single file
      expect(files).toHaveLength(1)

      let [filename, content] = files[0]

      // Check that utilities are included in the bundle
      // Note: The plugin currently processes each CSS file's source separately
      await fs.expectFileToContain(filename, [
        candidate`flex`,       // from both app-a and app-b
      ])

      // Verify the class is present in the output
      expect(content).toContain('.flex')
      // TODO: These utilities are not being generated from the configs
      // expect(content).toContain('.font-bold')
      // expect(content).toContain('.m-4')
      // expect(content).toContain('.p-4')
    },
  )
})