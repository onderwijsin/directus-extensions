# `@onderwijsin/directus-extension-utils`

Utilities for Onderwijs in Directus extensions. This package exists to keep small, stable helpers
for Directus extension code in one place instead of reimplementing them in every extension. The
helpers are runtime-agnostic within Directus: they can be used across different Directus setups, but
are not intended for non-Directus applications. The current API includes primitive guards, lock
providers, attempted operations, object conversions, MIME classification, UUID generation, logging
adapters, and reusable types. It deliberately does not contain Directus services, extension
registration, or schema validation.

For the complete API and design rules, read the
[extension-utils cookbook article](../../docs/extension-cookbook/extension-utils.md) and the
[primitive guards article](../../docs/extension-cookbook/guards.md).

## Usage

Install the package in an extension that needs a shared utility:

```sh
pnpm add @onderwijsin/directus-extension-utils
```

Import from the root for shared helpers:

```ts
import { isRecord, isString } from '@onderwijsin/directus-extension-utils'

if (isRecord(value) && isString(value.name)) {
  return value.name
}
```

For caches and key-value state inside a Directus runtime, use `@directus/memory` directly. Choose
`createCache` for disposable derived data and `createKv` for coordination state such as markers.
Both support local and Redis-backed stores; configure the Redis namespace explicitly in the
consuming server extension.

Lock providers return owner-bound leases. Contention returns `null`, while renewal and release
return `false` when the lease has expired, was already released, or no longer owns the generation:

```ts
import { createMemoryLockProvider } from '@onderwijsin/directus-extension-utils'
import {
  createFsLockProvider,
  createRedisLockProvider,
} from '@onderwijsin/directus-extension-utils/server'

const localLock = createMemoryLockProvider()
const lease = await localLock.tryAcquire('items:sync', { leaseMs: 30_000 })
if (lease) {
  await lease.renew()
  await lease.release()
}

const filesystemLock = createFsLockProvider({ directory: '/var/lock/my-extension' })
const redisLock = createRedisLockProvider({
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  namespace: 'my-extension:locks',
  lockTimeoutMs: 30_000,
})

const redisLease = await redisLock.tryAcquire('items:sync', { leaseMs: 60_000 })
if (redisLease) {
  try {
    await synchronizeItems()
  } finally {
    await redisLease.release()
    await redisLock.dispose()
  }
}
```

Memory locks coordinate one provider instance in one process. For Directus Redis coordination, use
`createRedisLockProvider`, which initializes Directus KV and owns the Redis connection. Its default
namespace is `directus:locks`, and its default lock timeout is 30 seconds. The filesystem provider
is server-only, requires an explicit shared directory, and coordinates only processes that can
access that directory; it never chooses `tmpdir()` or a backend from environment variables.

The lock surface intentionally preserves Tio's core concepts: named locks, the conventional
`bulk-operation` name (`BULK_OPERATION_LOCK`), atomic acquisition, stale recovery, and explicit
release. The new lease API is asynchronous and owner-bound: `tryAcquire` returns `null` on
contention, and `renew`/`release` return booleans. This replaces Tio's synchronous path-returning
helpers so a stale or replaced owner cannot delete another generation. Consumers migrating from Tio
should map `acquireLock({ lockName })` to `await provider.tryAcquire(lockName)`, retain the returned
lease, and call `lease.release()` in a `finally` block. The new filesystem adapter requires an
explicit directory rather than defaulting to the host temporary directory.

Auto-task handlers debounce trigger generations and use the same lock contract for execution:

```ts
import {
  createAutoTaskHandler,
  createMemoryTaskHandlerStorage,
} from '@onderwijsin/directus-extension-utils'

const handler = createAutoTaskHandler({
  debounceId: 'schema-snapshot',
  storage: createMemoryTaskHandlerStorage(),
  debounceMs: 15_000,
  markerLeaseMs: 5 * 60_000,
  taskLeaseMs: 5 * 60_000,
  task: async (signal) => snapshotSchema({ signal }),
  onError: (error) => reportTaskFailure(error),
})

await handler()
// Call handler() for each trigger; only the latest generation executes.
handler.dispose()
```

Choose one storage factory for the handler:

```ts
import {
  createFsTaskHandlerStorage,
  createRedisTaskHandlerStorage,
} from '@onderwijsin/directus-extension-utils/server'

const redisStorage = createRedisTaskHandlerStorage({
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  namespace: 'my-extension:tasks',
  lockTimeoutMs: 5 * 60_000,
})

const fileStorage = createFsTaskHandlerStorage({
  directory: '/var/lock/my-extension',
  lockTimeoutMs: 5_000,
})

const redisHandler = createAutoTaskHandler({
  debounceId: 'schema-snapshot',
  storage: redisStorage,
  task: async (signal) => snapshotSchema({ signal }),
})
```

All task-storage factories expose `lockTimeoutMs` as the provider's default coordination lock
lifetime when an acquire operation omits an explicit lease; filesystem marker operations use it
directly. `markerLeaseMs` is the maximum age of a pending trigger generation. `taskLeaseMs` is the
lifetime of the execution lock before renewal. They default to five minutes but can differ when
queued work and task execution have different limits. The task receives an `AbortSignal`; it must
stop promptly when the signal is aborted because the execution lease was lost. Call
`handler.dispose()` to cancel pending timers, then `await storage.dispose()` when the owning
extension is shutting down. Task failures, lock failures, marker failures, and lease renewal
failures are sent to `onError`.

Disposal has two layers: `handler.dispose()` cancels pending debounce/retry timers and prevents new
work, while `storage.dispose()` closes resources owned by the storage, such as its Redis connection.
Dispose the handler before the storage; neither call clears a marker or aborts a task that is
already running. Memory and filesystem storage currently have no external resource to close, so
their storage disposal is a no-op.

The Directus marker adapter uses `Kv.increment` and `Kv.usingLock` for atomic shared state. The
filesystem marker adapter remains available because `@directus/memory` has no filesystem backend.
Neither adapter creates connections or chooses a directory from the environment.

The former `applyingFlagPath` pattern is intentionally not part of this API. Migrate that gate to a
second named lock shared by the operation that creates the flag and the auto-task handler, rather
than coordinating through an unowned path.

Attempted operations can return failures as data instead of throwing:

```ts
import { attempt, attemptWithRetry } from '@onderwijsin/directus-extension-utils'

const result = await attempt(() => fetchValue())
if (result.error === null) console.log(result.data)

const retried = await attemptWithRetry(() => fetchValue(), { attempts: 3, delayMs: 250 })

// A retry result contains the final failure instead of throwing.
if (retried.error !== null) console.error(retried.error)
```

MIME values can be classified with the default registry or extended for a consuming project:

```ts
import { classifyMimeType } from '@onderwijsin/directus-extension-utils'

classifyMimeType('image/webp') // 'image'
classifyMimeType('application/vnd.example.custom', {
  documentMimeTypes: ['application/vnd.example.custom'],
}) // 'document'
```

Generate random or deterministic UUIDs without relying on a consuming project's UUID setup:

```ts
import { generateDeterministicUUID, generateUUID } from '@onderwijsin/directus-extension-utils'

const randomId = generateUUID()
const stableId = generateDeterministicUUID('external-item')
```

The `Logger` contract and `createLogger` adapter accept runtime-provided loggers while providing a
console fallback. Pino and Directus logger adapters remain outside the shared package surface.

Typed object helpers preserve the object's key/value types at the call site:

```ts
import { fromEntries, keys, toEntries } from '@onderwijsin/directus-extension-utils'

const settings = { enabled: true, retries: 3 } as const
toEntries(settings)
keys(settings)
fromEntries([
  ['enabled', true],
  ['retries', 3],
])
```

`toEntries` and `keys` use own enumerable string keys. `fromEntries` accepts any iterable and uses
the standard last-entry-wins behavior for duplicate keys.

Create a logger adapter when a consuming runtime supplies only some logging methods:

```ts
import { createLogger } from '@onderwijsin/directus-extension-utils'

const logger = createLogger({ info: (message, fields) => audit.info(message, fields) })
logger.warn('Using a fallback for an unavailable integration')
```

The adapter preserves supplied methods and falls back independently to `console` for missing
methods. `trace` and `debug` are optional on the logger contract; `info`, `warn`, and `error` are
always available.

The package also exports `PartialNested`, `Geometry`, and `LngLatCoordinates` for reusable typing in
Directus extensions. `PartialNested` recursively makes object properties optional while preserving
functions and constructors.

## Choosing an API

Keep orchestration in the consuming extension and choose the smallest utility that matches its
needs:

- use guards for one-value runtime narrowing;
- use a cache for disposable derived data;
- use a lock when only one owner may perform work;
- use an auto-task handler when triggers should be debounced and coordinated; and
- use `attempt` when failure should be returned as data.

Each utility accepts its runtime dependencies explicitly. The package does not read environment
variables, select filesystem directories, or register Directus handlers. Redis server utilities open
the connection represented by their explicit `redisUrl` and expose disposal for it.

Runtime-aware subpaths are available when an extension has an explicit runtime boundary:

```ts
import { isRecord } from '@onderwijsin/directus-extension-utils/server'
import { isString } from '@onderwijsin/directus-extension-utils/app'
import { isDefined } from '@onderwijsin/directus-extension-utils/shared'
```

The root and `shared` exports are the common Directus-extension surface. `server` re-exports those
helpers and adds the Redis and filesystem coordination providers; `app` remains browser-safe and
exposes the shared helpers only. These subpaths describe the extension runtime boundary, not support
for use outside Directus. The implementation modules are internal; import utilities from the root or
an explicit runtime subpath.

## Extending the package

Add a helper only when it serves Directus extensions, has stable semantics, and has more than one
credible Directus-extension consumer. Keep extension-specific orchestration in the owning extension.
Add shared helpers to `src/shared/` and export them through `src/shared/index.ts`; expose them from
the root only when they belong in the default shared API. Add runtime-specific helpers to
`src/server/` or `src/app/` without leaking them through the root export.

Use Zod for structured external input. These helpers are type-narrowing predicates, not parsers,
coercion utilities, or a schema system.

## Development

From the repository root:

```sh
pnpm --filter @onderwijsin/directus-extension-utils typecheck
pnpm --filter @onderwijsin/directus-extension-utils build
pnpm test:watch
```

The package has no standalone dev server or watch script. `build` writes generated declarations and
JavaScript to `dist/`; do not commit that output. Use the root watch command for an interactive
development loop.

## Testing policy

Tests live in [`__tests__/`](./__tests__/) and cover the public helper behavior and export contract.
Prefer focused unit tests for deterministic helpers. Do not add tests solely to increase coverage,
and do not test private implementation details when a public import expresses the consumer contract.

Run the package tests or the full repository suite with:

```sh
pnpm test -- packages/extension-utils/__tests__
pnpm test
```
