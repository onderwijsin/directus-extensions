# `extension-utils`

`extension-utils` is the publishable, framework-neutral helper package. It contains helpers with
stable semantics and more than one credible consumer. Extension-specific behavior stays in the
owning extension.

The current package provides the following public utility families:

- primitive runtime guards such as `isRecord`, `isString`, `isDefined`, `isFiniteNumber`,
  `isNonBlankString`, `hasKey`, and `hasKeys`;
- backend-independent cache contracts with memory, namespace, and injected Redis adapters;
- owner-bound lock leases with memory, injected Redis, and explicit server filesystem providers;
- debounced auto-task handlers backed by injected marker stores, schedulers, and lock providers;
- `attempt`, `attemptSync`, and bounded `attemptWithRetry` result wrappers;
- typed `toEntries`, `fromEntries`, and `keys` helpers;
- configurable MIME classification through `classifyMimeType`, `getFileType`, and category
  predicates;
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
`/shared` export paths. The server and app paths re-export the framework-neutral shared helpers,
with the server path additionally exposing the filesystem lock adapter.

The root and `/shared` exports are the framework-neutral public surface. `/server` re-exports those
helpers and adds the filesystem lock adapter; `/app` remains browser-safe and exposes the shared
helpers only. No utility selects a Directus service, cache backend, filesystem, Redis connection, or
deployment topology implicitly.

Cache contracts and lock adapters are now part of the package API. Debounced task coordination is
implemented by `createAutoTaskHandler`, with Redis and explicit-directory filesystem marker
adapters.

Auto-task callbacks receive an `AbortSignal`. They must stop promptly when the execution lease is
lost; a lease-lost generation is not marked complete and remains eligible for a later retry. Error
callbacks are best-effort and cannot make the trigger reject.

The lock API is deliberately close to Tio's process-lock feature surface while correcting its
ownership hazards. `BULK_OPERATION_LOCK` preserves the conventional lock name, named acquisition and
stale recovery remain available, and filesystem coordination is still supported. The consolidated
API returns an asynchronous owner-bound lease instead of a lock-file path, requires an explicit
filesystem directory, returns `null` for contention, and prevents an old lease from releasing a
replacement generation.

`applyingFlagPath` is intentionally not supported. It is an unowned second lock and can be replaced
by a second named `LockProvider` lease shared by the applying operation and the auto-task handler.

## Choosing a utility

Keep orchestration in the consuming extension and choose the smallest utility that matches its
needs:

- guards answer one runtime-narrowing question;
- caches hold disposable derived data;
- locks grant one owner a renewable lease;
- auto-task handlers debounce triggers and coordinate execution; and
- attempt helpers turn expected operation failures into result values.

All external resources are explicit dependencies. Utilities do not read environment variables,
create Redis connections, choose filesystem directories, or register Directus handlers.
