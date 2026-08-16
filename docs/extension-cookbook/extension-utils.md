# `extension-utils`

`extension-utils` is the publishable utility package for Directus extensions. It contains helpers
with stable semantics and more than one credible Directus-extension consumer. The utilities are
runtime-agnostic within Directus, so they can work across different Directus setups; they are not
intended as a general-purpose package for non-Directus applications. Extension-specific behavior
stays in the owning extension.

For the vocabulary used by locks, leases, markers, and auto-tasks, read the
[extension-utils glossary](extension-utils-glossary.md) before choosing or configuring a
coordination utility.

The current package provides the following public utility families:

- primitive runtime guards such as `isRecord`, `isString`, `isDefined`, `isFiniteNumber`,
  `isNonBlankString`, `hasKey`, and `hasKeys`;
- Directus memory/KV integration for runtime caches and coordination state;
- owner-bound lock leases with memory, Redis, and explicit server filesystem providers;
- debounced auto-task handlers backed by unified memory, Redis, or filesystem storage providers;
- `attempt`, `attemptSync`, and bounded `attemptWithRetry` result wrappers;
- typed `toEntries`, `fromEntries`, and `keys` helpers;
- configurable MIME classification through `classifyMimeType`, `getFileType`, and category
  predicates;
- random UUID v4 and deterministic UUID v5 helpers;
- `Logger`, `LoggerLike`, and `createLogger`; and
- reusable `PartialNested`, `Geometry`, and `LngLatCoordinates` types for Directus extensions.

Attempt helpers capture thrown or rejected values as `{ data: null, error }`. Retry options control
the total execution count, initial delay, and exponential versus constant backoff. MIME values are
trimmed and compared case-insensitively; unknown values remain `unknown`, and callers can provide
additional document MIME types. Environment helpers receive explicit values rather than reading
global process state. The default deterministic UUID namespace is `UUID_NAMESPACE_URL`.

Use public package subpaths, keep runtime dependencies intentional, test exports, and ensure private
test utilities never leak into the published package. The package uses `uuid`, `@directus/memory`,
and `ioredis` for its runtime integrations. Directus runtime extensions should add
`@directus/memory` when they need cache or KV storage. It exposes runtime-aware `/server`, `/app`,
and `/shared` export paths. The server and app paths re-export the common Directus-extension
helpers, with the server path additionally exposing Redis and filesystem coordination adapters.

The root and `/shared` exports are the common Directus-extension surface. `/server` re-exports those
helpers and adds Redis and filesystem coordination adapters; `/app` remains browser-safe and exposes
the shared helpers only. Utilities do not select a Directus service, cache backend, filesystem, or
deployment topology implicitly. The Redis lock utility explicitly owns the connection created from
its URL.

Cache and KV implementations belong to `@directus/memory`. Debounced task coordination is
implemented by `createAutoTaskHandler` and one of the unified task storage factories. Use
`createMemoryTaskHandlerStorage`, `createRedisTaskHandlerStorage`, or `createFsTaskHandlerStorage`;
each exposes `lockTimeoutMs` for the provider's default lock lease. The handler's `markerLeaseMs`
and `taskLeaseMs` remain separate controls.

Auto-task callbacks receive an `AbortSignal`. They must stop promptly when the execution lease is
lost; a lease-lost generation is not marked complete and remains eligible for a later retry. Error
callbacks are best-effort and cannot make the trigger reject.

Dispose an auto-task handler before its storage: `handler.dispose()` cancels pending timers, while
`storage.dispose()` closes resources owned by the provider, such as a Redis connection. Neither
operation clears markers or aborts a task that is already running. Memory and filesystem storage
currently have no external resources to close.

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
- Directus `createCache` holds disposable derived data;
- Directus `createKv` holds coordination state and supports shared locks;
- locks grant one owner a renewable lease;
- auto-task handlers debounce triggers and coordinate execution through one storage provider; and
- attempt helpers turn expected operation failures into result values.

All external resources are explicit dependencies. Utilities do not read environment variables,
choose filesystem directories, or register Directus handlers. The Redis lock provider is the one
intentional exception: it receives an explicit Redis URL and owns that connection.
