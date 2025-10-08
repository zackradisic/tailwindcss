import { describe } from 'vitest'
import { css, html, test, ts, json } from '../utils'

describe('Bun plugin', () => {
  test(
    'CSS Modules',
    {
      fs: {
        'package.json': json`
          {
            "type": "module",
            "dependencies": {
              "@tailwindcss/bun": "workspace:^",
              "tailwindcss": "workspace:^"
            }
          }
        `,
        'build.ts': ts`
          import plugin from '@tailwindcss/bun'

          const result = await Bun.build({
            entrypoints: ['./src/component.ts'],
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
        'index.html': html`
          <head>
            <script type="module" src="/src/component.ts"></script>
          </head>
          <body>
            <div id="root" />
          </body>
        `,
        'src/component.ts': ts`
          import { foo } from './component.module.css'
          let root = document.getElementById('root')
          root.className = foo
          root.innerText = 'Hello, world!'
        `,
        'src/component.module.css': css`
          @import 'tailwindcss/utilities';

          .foo {
            @apply underline;
          }
        `,
      },
    },
    async ({ exec, fs, expect }) => {
      await exec('bun run build.ts')

      let files = await fs.glob('dist/**/*.css')
      expect(files).toHaveLength(1)
      let [filename] = files[0]

      await fs.expectFileToContain(filename, [/text-decoration-line: underline;/gi])
    },
  )
})
