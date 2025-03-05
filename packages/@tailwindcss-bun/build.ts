import path from 'node:path'

const nodeFiles = [
  // Android
  './tailwindcss-oxide.android-arm64.node',
  './tailwindcss-oxide.android-arm-eabi.node',

  // Windows
  './tailwindcss-oxide.win32-x64-msvc.node',
  './tailwindcss-oxide.win32-ia32-msvc.node',
  './tailwindcss-oxide.win32-arm64-msvc.node',

  // macOS (Darwin)
  './tailwindcss-oxide.darwin-universal.node',
  './tailwindcss-oxide.darwin-x64.node',
  './tailwindcss-oxide.darwin-arm64.node',

  // FreeBSD
  './tailwindcss-oxide.freebsd-x64.node',

  // Linux
  './tailwindcss-oxide.linux-x64-musl.node',
  './tailwindcss-oxide.linux-x64-gnu.node',
  './tailwindcss-oxide.linux-arm64-musl.node',
  './tailwindcss-oxide.linux-arm64-gnu.node',
  './tailwindcss-oxide.linux-arm-musleabihf.node',
  './tailwindcss-oxide.linux-arm-gnueabihf.node',
  './tailwindcss-oxide.linux-riscv64-musl.node',
  './tailwindcss-oxide.linux-riscv64-gnu.node',
  './tailwindcss-oxide.linux-s390x-gnu.node',

  // Android
  '@tailwindcss/oxide-android-arm64',
  '@tailwindcss/oxide-android-arm-eabi',

  // Windows
  '@tailwindcss/oxide-win32-x64-msvc',
  '@tailwindcss/oxide-win32-ia32-msvc',
  '@tailwindcss/oxide-win32-arm64-msvc',

  // macOS (Darwin)
  '@tailwindcss/oxide-darwin-universal',
  '@tailwindcss/oxide-darwin-x64',
  '@tailwindcss/oxide-darwin-arm64',

  // FreeBSD
  '@tailwindcss/oxide-freebsd-x64',

  // Linux
  '@tailwindcss/oxide-linux-x64-musl',
  '@tailwindcss/oxide-linux-x64-gnu',
  '@tailwindcss/oxide-linux-arm64-musl',
  '@tailwindcss/oxide-linux-arm64-gnu',
  '@tailwindcss/oxide-linux-arm-musleabihf',
  '@tailwindcss/oxide-linux-arm-gnueabihf',
  '@tailwindcss/oxide-linux-riscv64-musl',
  '@tailwindcss/oxide-linux-riscv64-gnu',
  '@tailwindcss/oxide-linux-s390x-gnu',
].map((x) => {
  if (x.startsWith('.')) return path.join(import.meta.dirname, 'crates/node', x)
  return x
})
// let nodeFiles = []

await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist-pkg',
  target: 'bun',
  format: 'esm',
  minify: false,
  naming: {
    asset: '[name].[ext]',
  },
  //   external: externals.map((s) => './' + s),
  // external: ['./tailwindcss-oxide.android-arm64.node']
  // external: nodeFiles,
})
