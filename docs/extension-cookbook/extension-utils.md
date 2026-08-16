# `extension-utils`

`extension-utils` is the publishable, framework-neutral helper package. It contains helpers with
stable semantics and more than one credible consumer. Extension-specific behavior stays in the
owning extension.

The current package provides the following public utility families:

- primitive runtime guards such as `isRecord`, `isString`, `isDefined`, `isFiniteNumber`,
  `isNonBlankString`, `hasKey`, and `hasKeys`;
- backend-independent cache contracts with memory, namespace, and injected Redis adapters;
- `attempt`, `attemptSync`, and bounded `attemptWithRetry` result wrappers;
- typed `toEntries`, `fromEntries`, and `keys` helpers;
- configurable MIME classification through `classifyMimeType`, `getFileType`, and category
  predicates;
- explicit `isInteractive`, `isCiEnvironment`, and `shouldSkipConfirmation` environment predicates;
- random UUID v4 and deterministic UUID v5 helpers;
- `Logger`, `LoggerLike`, and `createLogger`; and
- framework-neutral `PartialNested`, `Geometry`, and `LngLatCoordinates` types.

Attempt helpers capture thrown or rejected values as `{ data: null, error }`. Retry options control
the total execution count, initial delay, and exponential versus constant backoff. MIME values are
trimmed and compared case-insensitively; unknown values remain `unknown`, and callers can provide
additional document MIME types. Environment helpers receive explicit values rather than reading
global process state. The default deterministic UUID namespace is `UUID_NAMESPACE_URL`.

Use public package subpaths, keep runtime dependencies intentional, test exports, and ensure private
test utilities never leak into the published package. The package has one intentional runtime
dependency, `uuid`, for UUID v4/v5 generation. It exposes runtime-aware `/server`, `/app`, and
`/shared` export paths. The server and app paths currently re-export the framework-neutral shared
helpers; runtime-specific helpers can be added behind those boundaries without changing consumer
imports.

The root and `/shared` exports are the framework-neutral public surface. `/server` and `/app` are
compatibility boundaries and currently expose the same symbols. No utility currently selects a
Directus service, cache backend, filesystem, Redis connection, or deployment topology implicitly.

Cache contracts and adapters are now part of the package API. Lock providers and debounced task
coordination remain design work documented in [`UTILITIES.md`](../../UTILITIES.md).
