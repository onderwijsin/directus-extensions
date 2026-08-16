# Extension utilities

`@onderwijsin/directus-extension-utils` provides small, reusable building blocks for Directus
extensions. The examples below are the quickest way to choose and use them.

## Choose a utility

| Need                                | Use                             |
| ----------------------------------- | ------------------------------- |
| Narrow an unknown value             | Guards                          |
| Return an error instead of throwing | `attempt` or `attemptWithRetry` |
| Store derived data                  | Directus `createCache`          |
| Store coordination state            | Directus `createKv`             |
| Coordinate one owner at a time      | A lock provider                 |
| Debounce and coordinate work        | `createAutoTaskHandler`         |
| Adapt a Directus logger             | `createLogger`                  |

## Import from the right runtime

The package is for Directus extensions. It is runtime-portable within Directus, but it is not a
framework-agnostic utility package.

Use the common entry point for browser-safe helpers:

```ts
import { attempt, isRecord, isString } from '@onderwijsin/directus-extension-utils'
```

Use `/server` for locks, tasks, task storage, and logging:

```ts
import {
  createAutoTaskHandler,
  createRedisTaskHandlerStorage,
} from '@onderwijsin/directus-extension-utils/server'
```

Do not import server utilities from an app bundle. The `/app`, `/shared`, and root exports contain
only the common helper surface.

## Guards

Guards narrow `unknown` values without assertions:

```ts
import { hasKey, isRecord, isString } from '@onderwijsin/directus-extension-utils'

export function getWebhookName(value: unknown): string | undefined {
  if (!isRecord(value) || !hasKey(value, 'name') || !isString(value.name)) return undefined
  return value.name.trim() || undefined
}
```

Other useful guards include `isDefined`, `isFiniteNumber`, `isNonBlankString`, and `hasKeys`.

## Attempts and retries

Use `attempt` when a failure is expected and the caller should handle a result:

```ts
import { attempt } from '@onderwijsin/directus-extension-utils'

const result = await attempt(() => client.items('orders').readOne(orderId))

if (result.error) {
  logger.error('Could not load order', { cause: result.error })
  return
}

return result.data
```

Use `attemptWithRetry` for bounded transient failures. `attempts` is the total number of calls, not
the number of retries after the first call:

```ts
import { attemptWithRetry } from '@onderwijsin/directus-extension-utils'

const result = await attemptWithRetry(() => syncSearchIndex(), {
  attempts: 3,
  delayMs: 250,
  exponentialBackoff: true,
})

if (result.error) throw result.error
```

For cache and KV guidance, see [Cache and KV](patterns-and-conventions.md#cache-and-kv).

## Locks

A lock acquisition returns an owner-bound lease. If another owner holds the lock, `tryAcquire`
returns `null`. Always release an acquired lease in `finally`.

### Process-local lock

Use memory locks only when every contender is in the same process:

```ts
import { createMemoryLockProvider } from '@onderwijsin/directus-extension-utils/server'

const locks = createMemoryLockProvider({
  defaultLeaseMs: 30_000,
})

const lease = await locks.tryAcquire('orders:rebuild', { leaseMs: 10_000 })
if (!lease) return // another execution owns the lock

try {
  await rebuildOrders()
} finally {
  await lease.release()
}
```

### Redis lock with all consumer options

Use Redis when multiple Directus processes or replicas can contend:

```ts
import { createRedisLockProvider } from '@onderwijsin/directus-extension-utils/server'

const locks = createRedisLockProvider({
  redisUrl: process.env.REDIS_URL!,
  namespace: 'my-extension:locks', // defaults to directus:locks
  defaultLeaseMs: 30_000, // default lease when tryAcquire omits leaseMs
  isContentionError: (error) => error instanceof Error && error.name === 'ExecutionError',
})

const lease = await locks.tryAcquire('orders:rebuild', { leaseMs: 60_000 })
if (!lease) return

const renewal = setInterval(() => {
  void lease.renew()
}, 20_000)

try {
  await rebuildOrders()
} finally {
  clearInterval(renewal)
  await lease.release()
  await locks.dispose()
}
```

The provider creates and owns the Redis connection. `leaseMs` is the expiry window: renew it while
long work is running, and release it when the work ends. A lease token prevents an old owner from
releasing a newer lock generation.

### Filesystem lock

Use the filesystem provider when contenders share a reliable directory, such as a mounted volume:

```ts
import { createFsLockProvider } from '@onderwijsin/directus-extension-utils/server'

const locks = createFsLockProvider({
  directory: '/var/lib/my-extension/locks',
})

const lease = await locks.tryAcquire('orders:rebuild', { leaseMs: 30_000 })
if (!lease) return

try {
  await rebuildOrders()
} finally {
  await lease.release()
}
```

Filesystem locks do not coordinate containers unless the directory is genuinely shared between them.
Use Redis for normal multi-replica deployments.

## Auto-task handlers

An auto-task handler turns repeated triggers into one debounced execution. The marker records the
latest trigger; the task lease elects one owner to run it.

### Process-local auto-task

```ts
import {
  createAutoTaskHandler,
  createMemoryTaskHandlerStorage,
} from '@onderwijsin/directus-extension-utils/server'

const storage = createMemoryTaskHandlerStorage({
  lockTimeoutMs: 5 * 60_000,
})

const handleSchemaChange = createAutoTaskHandler({
  taskId: 'schema:snapshot',
  storage,
  debounceMs: 15_000,
  markerLeaseMs: 5 * 60_000,
  taskLeaseMs: 5 * 60_000,
  retryMs: 30_000,
  renewalIntervalMs: 60_000,
  task: async (signal) => {
    await writeSchemaSnapshot({ signal })
  },
  onError: (error) => logger.error('Schema snapshot failed', { cause: error }),
})

await handleSchemaChange() // call this from each relevant Directus event

// During extension shutdown:
handleSchemaChange.dispose()
await storage.dispose()
```

`markerLeaseMs` limits how long an unprocessed trigger remains useful. `taskLeaseMs` controls the
owner lease while the task runs. They are separate because a pending trigger and active work have
different lifetimes; in many extensions, setting them to the same value is still reasonable.

### Redis auto-task for multiple replicas

Use one storage factory so locks and markers share the same backend and namespace:

```ts
import {
  createAutoTaskHandler,
  createRedisTaskHandlerStorage,
} from '@onderwijsin/directus-extension-utils/server'

const storage = createRedisTaskHandlerStorage({
  redisUrl: process.env.REDIS_URL!,
  namespace: 'my-extension:auto-tasks', // defaults to directus:task-handler
  lockTimeoutMs: 5 * 60_000,
  isContentionError: (error) => error instanceof Error && error.name === 'ExecutionError',
})

const handleOrderChange = createAutoTaskHandler({
  taskId: 'orders:reindex',
  storage,
  debounceMs: 10_000,
  markerLeaseMs: 10 * 60_000,
  taskLeaseMs: 5 * 60_000,
  retryMs: 30_000,
  renewalIntervalMs: 60_000,
  task: async (signal) => reindexOrders({ signal }),
  onError: (error) => logger.error('Order reindex failed', { cause: error }),
})

await handleOrderChange()

handleOrderChange.dispose()
await storage.dispose()
```

### Filesystem auto-task

Locks and markers use the same directory. All coordinating processes must be able to read and
atomically write it:

```ts
import {
  createAutoTaskHandler,
  createFsTaskHandlerStorage,
} from '@onderwijsin/directus-extension-utils/server'

const storage = createFsTaskHandlerStorage({
  directory: '/var/lib/my-extension/auto-tasks',
  lockTimeoutMs: 30_000,
})

const handleImport = createAutoTaskHandler({
  taskId: 'catalog:import',
  storage,
  task: (signal) => importCatalog({ signal }),
})
```

For tests, the storage factories also accept injectable clocks and token factories where exposed.
For production code, use the defaults.

## UUIDs

Use UUID v7 for new sortable identifiers. Use v4 when you specifically need an unsorted random ID,
or pass an input when the ID must be deterministic:

```ts
import { uuid, uuidv4 } from '@onderwijsin/directus-extension-utils'

const sortableId = uuid() // UUID v7; default
const randomId = uuidv4() // UUID v4
const stableId = uuid('external-item') // UUID v5, using the default namespace
const namespacedId = uuid('external-item', customNamespace) // UUID v5
```

## Logging

Server utilities accept a small structured logger contract. Adapt the logger supplied by the
Directus runtime, or use the console-backed default:

```ts
import { createLogger } from '@onderwijsin/directus-extension-utils/server'

const logger = createLogger(context.logger)

logger.info('Extension started', { extension: 'orders' })
logger.error('Import failed', { cause: error instanceof Error ? error.message : error })
```

## Shutdown

Dispose resources owned by your extension during Directus shutdown:

```ts
handler.dispose() // cancels pending debounce timers
await storage.dispose() // closes provider resources, such as Redis
await locks.dispose() // only for a standalone Redis lock provider
```

Disposal does not delete markers and does not abort a task that is already running. The task should
honor its `AbortSignal` when the lease is lost.

## More detail

- [Glossary](extension-utils-glossary.md) — locks, leases, markers, tokens, renewal, and disposal.
- [API reference](../../.agents/skills/directus-extension-utils/references/api-reference.md) — full
  export and option reference for maintainers.
- [Package README](../../packages/extension-utils/README.md) — package-level contract and exports.
