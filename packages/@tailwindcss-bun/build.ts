const externals = await Array.fromAsync(new Bun.Glob("*.node").scan({ cwd: 'binaries' }))
console.log('Externals', externals)
await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist-pkg",
    target: "node",
    format: 'esm',
    minify: false,
    // external: externals.map(s => "./" + s)
    external: ['./tailwindcss-oxide.android-arm64.node']
});