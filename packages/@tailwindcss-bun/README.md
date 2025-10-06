# @tailwindcss/bun

Bun plugin for [Tailwind CSS v4](https://tailwindcss.com).

## Installation

```sh
bun add -d @tailwindcss/bun
```

## Usage

Add the plugin to your `bunfig.toml`:

```toml
[build]
plugins = ["@tailwindcss/bun"]
```

Or use it programmatically with Bun's build API:

```ts
import tailwindcss from '@tailwindcss/bun'

await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  plugins: [tailwindcss],
})
```

## How it works

This plugin integrates Tailwind CSS with Bun's bundler by:

1. **Scanning source files**: Uses a native Bun plugin to scan all non-CSS files in the module graph for Tailwind candidates
2. **Generating CSS**: When loading CSS files, compiles Tailwind directives and generates utility classes based on discovered candidates
3. **Optimizing output**: Minifies and optimizes the final CSS

The plugin leverages Bun's parallel bundler architecture for fast builds.

## License

MIT
