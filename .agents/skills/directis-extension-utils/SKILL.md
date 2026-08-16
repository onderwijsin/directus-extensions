---
name: directis-extension-utils
description: Use when implementing, reviewing, or documenting Directus extensions that could use @onderwijsin/directus-extension-utils, especially guards, cache, locks, auto-tasks, retries, MIME classification, UUIDs, logging, typed object helpers, or runtime-specific imports.
---

# Directus extension utilities

Use this skill when an extension needs a small, framework-neutral helper. The package keeps
reusable behavior out of individual extensions while keeping Directus registration, environment
selection, service access, and application orchestration in the consuming extension.

## Route the work

Read the smallest set of sources that covers the task, then inspect current source exports:

1. Always read [`docs/extension-cookbook/extension-utils.md`](../../../docs/extension-cookbook/extension-utils.md)
   and [`packages/extension-utils/README.md`](../../../packages/extension-utils/README.md).
2. For primitive narrowing, also read [`docs/extension-cookbook/guards.md`](../../../docs/extension-cookbook/guards.md).
3. For package, test, build, export, or documentation changes, follow
   [`docs/agent-workflow.md`](../../../docs/agent-workflow.md) and [`docs/workspace.md`](../../../docs/workspace.md).
4. For runtime-specific work, verify the package `exports` map in
   [`packages/extension-utils/package.json`](../../../packages/extension-utils/package.json).
5. Consult [`references/api-reference.md`](references/api-reference.md) for the complete API surface.

Treat `packages/extension-utils/src/` and its public export indexes as the implementation source of
truth. `dist/` is generated; rebuild it before using declarations or packed output as evidence.

## Choose the smallest utility

- Use a guard when one value needs runtime narrowing.
- Use a cache for disposable derived data; cache misses are normal.
- Use a lock when one owner may perform work and ownership must be renewed or released.
- Use an auto-task handler when triggers must be debounced and execution coordinated.
- Use an attempt helper when an operation's failure should be returned as data.
- Use MIME helpers for classification, not structured input validation.
- Use UUID helpers when IDs need random or deterministic generation.
- Use object helpers when preserving key/value types around standard object operations matters.
- Use `createLogger` when a runtime logger is partial or optional.

Do not add a utility for one extension, Directus service access, schema validation, environment
lookup, connection creation, or extension registration. Keep those concerns in the owning extension.
Use Zod for structured external input and local guards for small runtime narrowing.

## Runtime and import rules

The package has one framework-neutral implementation and four public import paths:

- `@onderwijsin/directus-extension-utils` — default shared surface;
- `@onderwijsin/directus-extension-utils/shared` — explicit framework-neutral surface;
- `@onderwijsin/directus-extension-utils/app` — browser-safe shared surface; and
- `@onderwijsin/directus-extension-utils/server` — shared surface plus filesystem adapters.

Import from the root unless the runtime boundary is meaningful. Use `/server` for
`createFileLockProvider` and `createFileAutoTaskMarkerStore`; never import server filesystem code in
app or browser code. The app path must remain free of Node-only imports.

Use extension-owned adapters for external clients. Redis helpers receive an already connected,
Redis-compatible client and never create, connect, or close it. Filesystem helpers require an
explicit shared directory and never choose one from the environment or temporary-directory default.

## Contract rules

### Cache

Cache values are best-effort. `get` returns `undefined` for a miss or expired entry; backend and
serialization errors propagate. TTLs are finite, non-negative milliseconds, and `0` expires an
entry immediately. Use `createNamespacedCache` for independent consumers. Do not assume `clear()`
exists on every cache implementation or use Redis cache as a source of truth.

### Locks

`tryAcquire` returns an owner-bound lease or `null` on contention. Always retain the lease and
release it in `finally`; call `renew` while long-running work continues. A `false` renewal or
release means the owner no longer owns the generation. Never release by name alone and never allow
an old owner to remove a replacement generation.

`createMemoryLockProvider` coordinates one provider instance in one process. The Redis adapter
coordinates clients sharing its backend. The filesystem adapter coordinates only processes sharing
its directory; it is not cluster-wide without shared storage.

### Auto-tasks

`createAutoTaskHandler` records trigger generations, runs only the latest eligible generation, uses
the supplied lock provider, renews the task lease, and passes an `AbortSignal` to the task. The task
must stop promptly when the signal is aborted. A lost lease must not clear the marker. The default
marker store is process-local; distributed debounce requires both a distributed lock and a shared
marker store.

Use `dispose()` to cancel pending timers. Inject `now` and `scheduler` for deterministic tests.
Errors are reported through `onError` and do not make the trigger reject.

### Attempts

`attempt` and `attemptSync` return `{ data, error: null }` on success or `{ data: null, error }` on
failure. `attemptWithRetry` counts total executions, not retries after the first attempt. Validate
that the operation is safe to repeat before enabling retries.

### Public compatibility

Preserve existing exports and runtime subpaths unless the maintainer explicitly approves a breaking
change. Add new shared helpers only when they have stable semantics and more than one credible
consumer. Update source exports, tests, package README, cookbook documentation, and any matching
consumer skill together when the public contract changes.

## Implementation workflow

1. Identify the utility family and runtime boundary.
2. Read the relevant API reference and current tests before changing the contract.
3. Prefer an existing adapter or composition over a new backend or convenience abstraction.
4. Keep external dependencies injected and lifecycle ownership with the caller.
5. Add regression coverage for boundary behavior, contention, expiry, lease loss, malformed values,
   or export/runtime contracts as applicable.
6. Run formatting, lint autofix, typecheck, unit tests, build, package validation, and docs
   validation required by the repository. Run packed-consumer or E2E checks when loading or runtime
   behavior is affected.
7. Review root, `/shared`, `/app`, and `/server` exports and documentation for drift.

Completion means the selected utility is used through a documented public import, its runtime
boundary is valid, its failure and lifecycle semantics are covered, and every affected export,
test, README, cookbook article, and consumer skill is synchronized.
