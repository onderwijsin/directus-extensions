# Organization and modules

## Contents

- [Choose boundaries from responsibilities](#choose-boundaries-from-responsibilities)
- [Keep dependencies understandable](#keep-dependencies-understandable)
- [Separate execution domains and lifetimes](#separate-execution-domains-and-lifetimes)
- [Imports and exports](#imports-and-exports)
- [Match resolution to delivery](#match-resolution-to-delivery)

## Choose boundaries from responsibilities

Use the project's adopted feature or layer layout. TypeScript does not prescribe a folder
taxonomy. The examples below show valid arrangements; filenames and entry points still follow
the target package's build and runtime contracts.

One possible small package:

```text
src/
  index.ts          # intentional public surface
  parse-config.ts  # input contract and normalization
  import-records.ts
test/
  import-records.test.ts
```

One possible larger feature:

```text
src/
  imports/
    config.ts
    plan.ts
    run.ts
    types.ts
  adapters/
    filesystem.ts
    remote-store.ts
  cli.ts
  index.ts
```

Use `test/`, `tests/`, `__tests__/` or colocated tests according to discovery rules. Preserve
case-sensitive filenames, routes, framework discovery and build entries. Do not rename files
solely to match these examples.

Keep feature-owned types beside their implementation and independent shared contracts in the
project's established contract module. Type-only imports allow consumers to use these contracts
without creating runtime initialization edges. A `types.ts` file or `utils` directory has no
special TypeScript semantics.

## Keep dependencies understandable

Registration assembles the feature. Domain operations accept the capabilities they need;
adapters translate an SDK or storage mechanism into that contract.

```text
CLI / route / lifecycle registration
                |
                v
         feature operation ----> parser / domain rules
                |
                v
        narrow capability interface
                ^
                |
        SDK / filesystem adapter
```

This is dependency direction, not a requirement to create five layers. A short function with
one I/O callback may provide the boundary without a service container or class hierarchy.

```ts
interface RecordWriter {
  write(records: readonly string[]): Promise<number>;
}

export async function importRecords(
  records: readonly string[],
  writer: RecordWriter,
): Promise<number> {
  if (records.length === 0) return 0;
  return writer.write(records);
}
```

For cycles, identify who owns the shared concept before adding a barrel or moving everything
into `types.ts`. Type-only cycles can be erased at runtime yet still reveal coupled contracts.
A type import alone does not repair a runtime cycle.

## Separate execution domains and lifetimes

Keep browser, server, worker, CLI, build-time and shared code honest about its execution domain.
Shared types may cross boundaries; secrets and Node-only dependencies cannot enter browser code.
A `shared/` folder is a claim to verify through its transitive imports.

Express these distinctions through the target's actual execution model:

- Importing a module should not unexpectedly connect to a backend, mutate files or start a
  watcher. Make intentional registration side effects explicit.
- Choose application, request, component or operation ownership for state. A global cache can
  suit immutable metadata and be wrong for request credentials.
- Register cleanup where watchers, subscriptions or connections are started. Use the host's
  lifecycle instead of creating a competing lifecycle framework.
- Lazy-load optional or expensive code when its activation boundary warrants it. Dynamic imports
  do not install unavailable dependencies or guarantee safe browser bundles.
- Preserve getters, `this` binding and live references when moving code. Spreading a context
  reads getters immediately and can freeze state that must remain live.

## Imports and exports

Use effective import-sort and type-import rules. Keep semantic side-effect import order intact.
Use `node:` for Node builtins where supported and consistent with project style.

Direct internal imports expose ownership. A maintained `index.ts` can define a useful public
boundary; unrestricted `export *` networks can widen it accidentally, create cycles or pull
server code into browser bundles. Named and default exports both have legitimate contracts;
framework entry points often require defaults. Follow the actual public API.

For published packages, check:

1. Entries and export conditions match actual build outputs.
2. Public JavaScript and declarations expose compatible contracts.
3. Shipped files contain referenced runtime resources and declarations.
4. Internal aliases do not leak unresolved into published artifacts.
5. Existing subpaths remain usable unless a breaking change is authorized.

A wildcard export is a compatibility surface even when its breadth was accidental. Search
consumers and release policy before restricting it. Source tests through aliases do not prove
a packed consumer can resolve the package.

## Match resolution to delivery

Consult [TypeScript's compiler-option guide](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
and the actual runtime documentation. Source syntax can work in a test loader and fail after
publishing.

| Delivery model                         | Decision to verify                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Bundled application                    | Bundler-supported resolution and transforms                                       |
| Compiled code executed by Node         | Node-aware module mode, package `type`, output extensions and relative specifiers |
| Library with externalized dependencies | External imports and declarations in supported consumers                          |
| Browser or worker                      | Globals, compatible dependencies and bundle boundaries                            |
| Generated or virtual modules           | Generation, runtime resolution and declarations together                          |
| Direct TypeScript execution            | Actual loader/runtime syntax and resolution support                               |

Avoid universal `tsconfig` templates. A `paths` mapping helps the compiler resolve a name; it
does not by itself rewrite emitted imports. `lib` provides declarations, not polyfills. Adding
DOM declarations to silence a server error can hide an invalid runtime dependency. Edit the
owning generator or source when a configuration file is generated.
