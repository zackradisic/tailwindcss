> (Sorry for creating this PR without opening an issue first)

This PR implements a Bun plugin which enables TailwindCSS support for Bun.

# Overview

This plugins is comprised of two parts:

- A regular Bun bundler plugin which is the main driver of everything and invokes the native bundler plugin
- A [native bundler plugin](https://bun.sh/docs/bundler/plugins#native-plugins) which parallelizes the module graph scanning of candidates

## Native bundler plugin

The native bundler plugin is used to scan the module graph in parallel with the `Scanner` struct from `@tailwindcss/oxide`.

The main logic for this code is in the `tw_on_before_parse` function.

Native bundler plugins run in parallel on Bun's bundler threads and do not need to do UTF-16 <-> UTF-8 string conversions. This speeds up the plugin a lot.

Native bundler plugins are NAPI modules which export additional symbols (since NAPI modules themselves are dynamically loaded libraries which can be `dlopen()`'d). The [`bun-native-plugin`](https://crates.io/crates/bun-native-plugin) crate handles the boilerplate for creating one.

I placed the Bun plugin inside the existing `crates/node/lib.rs` (the `@tailwindcss/oxide` package). This reduces the need to create more compiled artifacts at the cost of a relatively small binary size change:

```sh
# original size
❯ ls -lhS dist/tailwindcss-oxide-darwin-arm64.tgz
-rw-r--r--@ 1 zackradisic  staff   2.1M Feb  4 20:42 dist/tailwindcss-oxide-darwin-arm64.tgz

# new size
❯ ls -lhS dist/tailwindcss-oxide-darwin-arm64.tgz
-rw-r--r--@ 1 zackradisic  staff   2.2M Feb  4 18:42 dist/tailwindcss-oxide-darwin-arm64.tgz
```

Please let me know if you would like me to split it out into its own separate package if you don't like the binary size change.

### Sharing state between the native plugin and JS

The scanned candidates and other state are held inside a NAPI External. The struct in the code that does
this is called `TailwindContextExternal`.

A NAPI External is a NAPI value which can be given to JS and which holds a `void*` data pointer. This data is inaccessible to JS, but a NAPI module can dereference the data and convert it to NAPI values.

This looks a bit like this on the Rust side:

```rust
/// Create the TailwindContextExternal and return it to JS wrapped in a Napi External.
///
/// Napi has an `External<T>` type which allows us to wrap it in an
/// external easily.
#[no_mangle]
#[napi]
pub fn twctx_create() -> External<TailwindContextExternal> {
  let external = External::new(TailwindContextExternal {
    module_graph_candidates: Default::default(),
    dirty: AtomicBool::new(false),
  });

  external
}
```

And the JS side:

```ts
// import napi functions which let us manipulate the external
import { twctxCreate, twctxIsDirty, twctxToJs } from '@tailwindcss/oxide'

// create the state, the returned value
// is a Napi External
const external = twctxCreate()

/* ... other code ... */

let moduleGraphCandidates = new Map<string, Set<string>>()
function getSharedCandidates() {
  // check if there are changes
  if (twctxIsDirty(external)) {
    // convert the state into js values
    let rawCandidates: Array<{ id: string; candidates: string[] }> = twctxToJs(external)
    for (let { id, candidates } of rawCandidates) {
      moduleGraphCandidates.set(id, new Set(candidates))
    }
  }
  return moduleGraphCandidates
}
```

### `napi-rs` version bump

The `napi-rs` crate was updated to version `2.16.15` so we can use the [`External::inner_from_raw()`](https://docs.rs/napi/latest/napi/bindgen_prelude/struct.External.html#method.inner_from_raw) function to turn an `External`'s `*mut c_void` pointer back into `TailwindContextExternal`.

## JS plugin

The JS plugin `@tailwindcss-bun/src/index.ts` uses logic copied over from the vite plugin implementation but modified to work with Bun's plugin API.

It invokes the native bundler plugin using the `.onBeforeParse` plugin API function:

```ts
build.onBeforeParse(
  // filter which files the native plugin apply to
  { filter: NON_CSS_ROOT_FILE_RE },

  // pass the napi module, the symbol which points to the plugin main function,
  // and the external which holds the tailwind state
  { napiModule: addon, symbol: 'tw_on_before_parse', external },
)
```

One thing to note is that Bun's bundler currently does not have an API that is analogous to `.addWatchedFile()`, so there is currently no way to add additional files to the module graph.
