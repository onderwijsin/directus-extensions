# `@onderwijsin/directus-extension-utils`

Framework-neutral utilities shared by Onderwijs in Directus extensions. This package exists to keep
small, stable runtime helpers in one place instead of reimplementing them in every extension. The
current API includes primitive guards, cache stores, lock providers, attempted operations, object
conversions, MIME classification, UUID generation, logging adapters, and reusable types. It
deliberately does not contain Directus services, extension registration, or schema validation.

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

Cache behavior is explicit and backend-independent. Choose a process-local memory store or inject a
Redis-compatible client; the package never reads environment variables or creates a connection:

```ts
import {
  createMemoryCache,
  createNamespacedCache,
  createRedisCache,
} from '@onderwijsin/directus-extension-utils'

const cache = createNamespacedCache(createMemoryCache(), 'items')
await cache.set('42', { title: 'Example' }, { ttlMs: 60_000 })
const item = await cache.get<{ title: string }>('42')

// Redis uses the same CacheStore contract with an injected client.
const distributedCache = createRedisCache(redisClient)
```

Cache entries are best-effort optimizations. Missing or expired entries return `undefined`, TTLs are
non-negative milliseconds, and backend errors are propagated. The Redis adapter uses JSON by
default, supports an injected codec, sends TTLs using `SET ... PX`, and intentionally does not
expose a global clear operation. Use separate namespaces for independent consumers.

Lock providers return owner-bound leases. Contention returns `null`, while renewal and release
return `false` when the lease has expired, was already released, or no longer owns the generation:

```ts
import {
  createMemoryLockProvider,
  createRedisLockProvider,
} from '@onderwijsin/directus-extension-utils'
import { createFileLockProvider } from '@onderwijsin/directus-extension-utils/server'

const localLock = createMemoryLockProvider()
const lease = await localLock.tryAcquire('items:sync', { leaseMs: 30_000 })
if (lease) {
  await lease.renew()
  await lease.release()
}

const distributedLock = createRedisLockProvider(redisClient)
const filesystemLock = createFileLockProvider({ directory: '/var/lock/my-extension' })
```

Memory locks coordinate one provider instance in one process. Redis coordinates consumers sharing
the injected Redis-compatible client. The filesystem provider is server-only, requires an explicit
shared directory, and coordinates only processes that can access that directory; it never chooses
`tmpdir()` or a backend from environment variables.

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
  createMemoryLockProvider,
  createRedisAutoTaskMarkerStore,
} from '@onderwijsin/directus-extension-utils'
import { createFileAutoTaskMarkerStore } from '@onderwijsin/directus-extension-utils/server'

const handler = createAutoTaskHandler({
  debounceId: 'schema-snapshot',
  lockProvider: createMemoryLockProvider(),
  debounceMs: 15_000,
  taskLeaseMs: 5 * 60_000,
  task: async (signal) => snapshotSchema({ signal }),
  onError: (error) => reportTaskFailure(error),
})

// Use one of these when debounce state must be shared across processes:
const redisMarkers = createRedisAutoTaskMarkerStore(redisClient)
const fileMarkers = createFileAutoTaskMarkerStore({ directory: '/var/lock/my-extension' })

await handler()
// Call handler() for each trigger; only the latest generation executes.
handler.dispose()
```

`createAutoTaskHandler` defaults to the `BULK_OPERATION_LOCK` name, a five-minute marker lease, and
a retry after lock contention. The task receives an `AbortSignal`; it must stop promptly when the
signal is aborted because the execution lease was lost. The marker is not completed after lease
loss, allowing a later owner to retry it. Inject `markerStore` when debounce state must be shared
across processes, and inject `scheduler` and `now` for deterministic runtimes or tests. The default
marker store is process-local; a distributed lock alone prevents simultaneous execution but does not
merge debounce triggers across processes. Task failures, lock failures, marker failures, and lease
renewal failures are sent to `onError`; failures thrown by `onError` itself are logged and do not
reject the trigger.

The Redis marker adapter atomically increments generations through the injected client. The
filesystem marker adapter uses an explicit directory and an owner-bound lock to serialize marker
updates. Neither adapter creates connections or chooses a directory from the environment.

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

The package also exports `PartialNested`, `Geometry`, and `LngLatCoordinates` for framework-neutral
typing. `PartialNested` recursively makes object properties optional while preserving functions and
constructors.

## Choosing an API

Keep orchestration in the consuming extension and choose the smallest utility that matches its
needs:

- use guards for one-value runtime narrowing;
- use a cache for disposable derived data;
- use a lock when only one owner may perform work;
- use an auto-task handler when triggers should be debounced and coordinated; and
- use `attempt` when failure should be returned as data.

Each utility accepts its runtime dependencies explicitly. The package does not read environment
variables, open connections, select filesystem directories, or register Directus handlers.

Runtime-aware subpaths are available when an extension has an explicit runtime boundary:

```ts
import { isRecord } from '@onderwijsin/directus-extension-utils/server'
import { isString } from '@onderwijsin/directus-extension-utils/app'
import { isDefined } from '@onderwijsin/directus-extension-utils/shared'
```

The root and `shared` exports are the framework-neutral public surface. `server` re-exports those
helpers and adds the filesystem lock provider; `app` remains browser-safe and exposes the shared
helpers only. The implementation modules are internal; import utilities from the root or an explicit
runtime subpath.

## Extending the package

Add a helper only when it is framework-neutral, has stable semantics, and has more than one credible
consumer. Keep Directus-specific behavior in the owning extension. Add shared helpers to
`src/shared/` and export them through `src/shared/index.ts`; expose them from the root only when
they belong in the default shared API. Add runtime-specific helpers to `src/server/` or `src/app/`
without leaking them through the root export.

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
