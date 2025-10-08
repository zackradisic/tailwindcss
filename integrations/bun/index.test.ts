import path from 'node:path'
import { describe } from 'vitest'
import { candidate, css, html, js, json, test, ts, yaml } from '../utils'

describe('Bun plugin', () => {
  test(
    `production build`,
    {
      fs: {
        'package.json': json`{}`,
        'pnpm-workspace.yaml': yaml` packages:
            - project-a `,
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
          <head>
            <link rel="stylesheet" href="./src/index.css" />
          </head>
          <body>
            <div class="underline m-2">Hello, world!</div>
          </body>
        `,
        'project-a/index.ts': ts`
          import './src/index.css'
          console.log('Hello from Bun!')
        `,
        'project-a/tailwind.config.js': js`
          export default {
            content: ['../project-b/src/**/*.js'],
          }
        `,
        'project-a/src/index.css': css`
          @reference 'tailwindcss/theme';
          @import 'tailwindcss/utilities';
          @config '../tailwind.config.js';
          @source '../../project-b/src/**/*.html';
        `,
        'project-b/src/index.html': html`
          <div class="flex" />
        `,
        'project-b/src/index.js': js`
          const className = "content-['project-b/src/index.js']"
          module.exports = { className }
        `,
      },
    },
    async ({ root, fs, exec, expect }) => {
      await exec('bun run build.ts', { cwd: path.join(root, 'project-a') })

      let files = await fs.glob('project-a/dist/**/*.css')
      expect(files).toHaveLength(1)
      let [filename] = files[0]

      await fs.expectFileToContain(filename, [
        candidate`underline`,
        candidate`m-2`,
        candidate`flex`,
        candidate`content-['project-b/src/index.js']`,
      ])
    },
  )
})
