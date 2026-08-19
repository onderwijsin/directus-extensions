# Extension utilities

`@onderwijsin/directus-extension-utils` provides small, reusable building blocks for Directus
extensions. Read this article before adding a local helper or importing a shared utility. The
examples below are grouped by concern so the import boundary and coordination vocabulary stay
visible.

## Choose a utility

| Need                                                                | Use                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Narrow an unknown value                                             | [Guards](guards.md)                                                               |
| Return an error instead of throwing                                 | [`attempt`](#attempts-and-retries) or [`attemptWithRetry`](#attempts-and-retries) |
| Store derived data                                                  | Directus `createCache`                                                            |
| Store coordination state                                            | Directus `createKv`                                                               |
| Coordinate one [owner](extension-utils-glossary.md#owner) at a time | A lock provider                                                                   |
| Debounce and coordinate work                                        | [`createAutoTaskHandler`](#auto-task-handlers)                                    |
| Adapt a Directus logger                                             | [`createLogger`](#logging)                                                        |

## Runtime subpaths

Use public package subpaths rather than source paths:

| Subpath                                           | Contents                                                           | Intended use                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `@onderwijsin/directus-extension-utils`           | Common helpers                                                     | Server and app code that does not need server-only coordination |
| `@onderwijsin/directus-extension-utils/shared`    | Common helpers                                                     | Explicit shared/runtime imports                                 |
| `@onderwijsin/directus-extension-utils/app`       | Common helpers                                                     | App extensions; no server-only utilities                        |
| `@onderwijsin/directus-extension-utils/server`    | Common helpers plus locks, auto-tasks, storage, logging, and setup | Directus server extensions and server lifecycle code            |
| `@onderwijsin/directus-extension-utils/constants` | Deployment constants                                               | Environment schemas and deployment-value validation             |
| `@onderwijsin/directus-extension-utils/sentry`    | Sentry capture and context helpers                                 | Server extensions that explicitly use Sentry                    |

The `/sentry` entry point is intentionally separate from `/server`. This prevents consumers that
only import server utilities such as `createLogger` from loading the Sentry integration.

The package also exposes an unbundled build configuration at
`@onderwijsin/directus-extension-utils/extension.config.js`. It can be imported as the default
configuration or used to add extension-specific externals with `createExtensionConfig`.

The root, `/shared`, and `/app` exports are the common browser-safe surface. The `/server` export
adds Node/server utilities and re-exports the common surface. Keep server-only imports out of app
bundles.

## Import from the right runtime

The package is for Directus extensions. It is runtime-portable within Directus, but it is not a
framework-agnostic utility package.

Use the common entry point for browser-safe helpers:

```ts
import { attempt, isRecord, isString } from '@onderwijsin/directus-extension-utils'
```

Use `/constants` for shared deployment-environment values:

```ts
import { DEPLOYMENT_ENV, deploymentEnvs } from '@onderwijsin/directus-extension-utils/constants'
import { z } from 'zod'

const defaultEnvironment: DEPLOYMENT_ENV = 'development'
const environmentSchema = z.enum(deploymentEnvs)
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

## Utility reference

| Group          | Public utilities                                                                                                                                                                  | Import from       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Guards         | `isDefined`, `isRecord`, `isArray`, `isString`, `isNonEmptyString`, `isNonBlankString`, `isNumber`, `isFiniteNumber`, `isInteger`, `isBoolean`, `isFunction`, `hasKeys`, `hasKey` | Root or `/shared` |
| Attempts       | `attempt`, `attemptSync`, `attemptWithRetry`                                                                                                                                      | Root or `/shared` |
| Object helpers | `keys`, `toEntries`, `fromEntries`                                                                                                                                                | Root or `/shared` |
| MIME and IDs   | `classifyMimeType`, `isAudioMimeType`, `isVideoMimeType`, `isImageMimeType`, `isDocumentMimeType`, `uuid`, `uuidv4`                                                               | Root or `/shared` |
| Locks          | `createMemoryLockProvider`, `createFsLockProvider`, `createRedisLockProvider`                                                                                                     | `/server`         |
| Auto-tasks     | `createAutoTaskHandler`, marker stores, and task storage factories                                                                                                                | `/server`         |
| Logging        | `createLogger`                                                                                                                                                                    | `/server`         |
| Setup          | `extensionSetup`, `validateExtensionOptions`, `registerSchemaChangeOnStart`                                                                                                       | `/server`         |
| Schema changes | `schemaChangeSchema`, `ensureDirectusSchema`, `getSchemaChangeStatus`, `replaceCollectionNameInSchema`                                                                            | `/server`         |
| Constants      | `deploymentEnvs`, `DEPLOYMENT_ENV`                                                                                                                                                | `/constants`      |
| Sentry         | `captureException`, `captureMessage`, `addBreadcrumb`, `setUser`                                                                                                                  | `/sentry`         |

### Extension setup

Use `extensionSetup` at an API or server extension boundary to log lifecycle state and honor the
`<EXTENSION_NAME>_ENABLED` environment flag. Every extension environment schema belongs in the
entrypoint's sibling `src/env.schema.ts`; import it into the entrypoint and pass it to
`validateExtensionOptions` before registering extension behavior:

```ts
import {
  extensionSetup,
  validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { envSchema } from './env.schema'

// Extension registration (defineHook, defineEndpoint, etc)
export default defineHook(({ init, embed }, { env, logger }) => {
  const setup = extensionSetup('my-extension', env, logger)
  setup.start()
  if (!setup.isEnabled()) return

  const options = validateExtensionOptions(env, envSchema, logger)
  // Register extension behavior using options.
  setup.end()
})
```

The setup helper does not register routes or events. The caller owns Directus registration and
resource cleanup. Invalid Zod configuration is logged and throws
`Invalid extension options ☝. Exiting.`.

### Schema changes

Use `schemaChangeSchema` for global enablement and locking flags, then call `ensureDirectusSchema`
with the hook context's `database`, `getSchema`, `services`, and a trusted portable definition.
Existing compatible resources are preserved; incompatible structural resources are logged and left
unchanged. Register the operation with `registerSchemaChangeOnStart` to apply the global and
extension-specific disabled checks consistently.

Each collection definition must include a non-blank `schema.name` and the collection's primary-key
field in its nested `fields` array. Keep that primary-key field out of the top-level `fields` array:

```json
{
  "collection": "magic_links",
  "schema": { "name": "magic_links" },
  "fields": [
    {
      "collection": "magic_links",
      "field": "id",
      "type": "uuid",
      "schema": { "is_primary_key": true }
    }
  ]
}
```

When a bundled schema supports a configurable collection name, use the shared replacement helper:

```ts
import { replaceCollectionNameInSchema } from '@onderwijsin/directus-extension-utils/server'

const configuredSchema = replaceCollectionNameInSchema('custom_orders', bundledSchema)
```

The collection guard preserves malformed definitions instead of allowing Directus to create an
implicit integer primary key. The utility logs the incompatible collection and continues with the
rest of the ensure operation.

Compose the shared schema-change environment into an extension schema:

```ts
import { schemaChangeSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

export const envSchema = schemaChangeSchema.extend({
  ORDERS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
})
```

The provider can then be selected entirely through environment configuration:

```dotenv
DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=true
DIRECTUS_EXTENSIONS_LOCK_PROVIDER=REDIS
DIRECTUS_EXTENSIONS_LOCK_REDIS_URL=redis://redis:6379
```

Use `FS` with `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY` when all contenders share a filesystem, or
`MEMORY` when all contenders run in one process. Memory providers with the same `providerId` share
state in that process; different IDs isolate lock namespaces. Redis connections created from
environment configuration are closed after schema setup. To supply a provider with custom lifecycle
or connection ownership, override the environment selection:

```ts
import {
  createRedisLockProvider,
  ensureDirectusSchema,
} from '@onderwijsin/directus-extension-utils/server'

const lockProvider = createRedisLockProvider({
  redisUrl: env.REDIS_URL,
  namespace: 'orders:schema',
})

await ensureDirectusSchema({
  extensionId: 'orders',
  database: context.database,
  getSchema: context.getSchema,
  services: context.services,
  logger,
  definition: ordersDefinition,
  options: { lockProvider },
})
```

For a normal hook, use the startup helper so failures are logged without rejecting Directus hook
registration:

```ts
registerSchemaChangeOnStart(
  action,
  logger,
  () =>
    ensureDirectusSchema({
      extensionId: 'orders',
      database: context.database,
      getSchema: context.getSchema,
      services: context.services,
      logger,
      definition: ordersDefinition,
      options: {
        lockProviderConfig: options,
      },
    }),
  {
    name: 'Orders',
    disabled: !options.ORDERS_SCHEMA_CHANGES_ENABLED,
    disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
  },
)
```

The package README and
[maintainer API reference](../../.agents/skills/directus-extension-utils/references/api-reference.md)
contain the complete signatures. This article focuses on choosing a group and using it safely.

The shared configuration and per-operation controls are:

| Option                                       | Scope     | Default          | Notes                                                           |
| -------------------------------------------- | --------- | ---------------- | --------------------------------------------------------------- |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` | global    | `true`           | Disables every extension's schema setup when false.             |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`          | global    | `MEMORY`         | Choose `MEMORY`, `REDIS`, or `FS`.                              |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`         | global    | —                | Optional override; falls back to Directus `REDIS`.              |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`      | global    | —                | Required when the provider is `FS`.                             |
| `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE`     | global    | `memory`         | Selects the process-local or Redis extension limiter store.     |
| `REDIS`                                      | Directus  | —                | Required by extension limiters when the store is `redis`.       |
| `lockProviderConfig`                         | operation | —                | Validated environment options for automatic provider creation.  |
| `lockProvider`                               | operation | —                | Explicit consumer-owned provider; takes precedence over config. |
| `abortOnError`                               | operation | `true`           | Keep false to log and continue after a service failure.         |
| `lockLeaseMs`                                | operation | provider default | Per-acquisition lease override.                                 |

The operation always acquires the configured lock. The result reports created resources by stable
identifiers in `changed`; `skipped` is true when the lock was held by another process. Existing
compatible resources are not updated. An existing field is compatible when its type matches; an
existing relation is compatible when its collection, field, and related collection endpoints match.
Other metadata—interfaces, displays, labels, icons, visibility, notes, and templates—is
intentionally non-authoritative. Each ensure emits an info-level plan and summary; per-resource and
lock lifecycle details are debug-level, while incompatible resources and failures remain logged
loudly. Keep schema definitions trusted and version-controlled; no runtime Zod schema is needed for
the definition JSON itself.

To inspect schema setup from another code path, use the read-only status query:

```ts
import { getSchemaChangeStatus } from '@onderwijsin/directus-extension-utils/server'

const { isLocked } = await getSchemaChangeStatus({
  extensionId: 'orders',
  options: { lockProviderConfig: options },
})
```

`getSchemaChangeStatus` never acquires or changes a lock. It must resolve the same provider and use
the same extension identifier as `ensureDirectusSchema`; memory providers require the same provider
instance, while Redis or a genuinely shared filesystem can be queried from another process.

For test or migration extensions, make cleanup explicit and idempotent. Delete temporary collections
in a `finally` block after the ensure has completed, and let the outer Compose runner remove the
disposable database and volumes even when Vitest or Directus startup fails.

## Guards

Guards narrow `unknown` values without assertions. See the [primitive runtime guards](guards.md)
article for exact semantics and selection rules:

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

A [lock](extension-utils-glossary.md#lock) acquisition returns an owner-bound
[lease](extension-utils-glossary.md#lease). If another [owner](extension-utils-glossary.md#owner)
holds the lock, `tryAcquire` returns `null`; use `isLocked` for a read-only check. Always release an
acquired lease in `finally`.

### Process-local lock

Use memory locks only when every contender is in the same process:

```ts
import { createMemoryLockProvider } from '@onderwijsin/directus-extension-utils/server'

const locks = createMemoryLockProvider({
  providerId: 'orders',
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

The provider creates and owns the Redis connection. `leaseMs` is the
[lease duration](extension-utils-glossary.md#lease-duration):
[renew](extension-utils-glossary.md#renew) it while long work is running, and
[release](extension-utils-glossary.md#release) it when the work ends. A
[token](extension-utils-glossary.md#token) prevents an old owner from releasing a newer lock
generation.

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
Use Redis for normal multi-replica deployments. After a filesystem lease is released, its owner
metadata is removed immediately; the claim marker is reclaimed atomically by the next contender so a
late old owner cannot remove a replacement claim.

## Auto-task handlers

Successful tasks clear their matching marker. If a task throws or rejects, the handler reports the
failure through `onError`, releases the lease, and keeps the marker pending for a later trigger; it
does not automatically retry the task. Lease loss also keeps the marker pending after aborting the
task signal. Tasks should cooperate with the signal and be safe to run again after a failure.

### Marker stores and concurrent triggers

Standalone marker stores are available from the server entry point:

```ts
import {
  createFsMarkerStore,
  createMemoryMarkerStore,
  createRedisMarkerStore,
} from '@onderwijsin/directus-extension-utils/server'
```

Each trigger writes the newest [marker](extension-utils-glossary.md#marker)
[generation](extension-utils-glossary.md#generation); a burst is not silently deduplicated because
the latest generation and timestamp must remain observable. Memory updates are process-local and
synchronous, Redis updates are serialized by the backend KV lock, and filesystem updates are queued
per identifier within one store instance and protected by the shared filesystem lock. Use Redis for
cross-replica coordination.

An [auto-task handler](extension-utils-glossary.md#auto-task-handler) turns repeated triggers into
one debounced execution. The marker records the latest trigger; the
[task lease](extension-utils-glossary.md#task-lease) elects one owner to run it.

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
[owner lease](extension-utils-glossary.md#lease) while the task runs. They are separate because a
pending trigger and active work have different lifetimes; in many extensions, setting them to the
same value is still reasonable.

### Redis auto-task for multiple replicas

Use one [storage](extension-utils-glossary.md#storage) factory so locks and markers share the same
backend and namespace:

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

For tests, the storage factories also accept injectable clocks and
[token](extension-utils-glossary.md#token) factories where exposed. For production code, use the
defaults.

## Object helpers, MIME, and UUIDs

The common entry point also includes typed object helpers, MIME classification, and UUID helpers.
Use these for small reusable transformations; keep domain-specific parsing at the owning boundary.

### Typed object helpers

```ts
import { fromEntries, keys, toEntries } from '@onderwijsin/directus-extension-utils'

const options = { retries: 3, timeoutMs: 5_000 }
const names = keys(options)
const doubled = fromEntries(toEntries(options).map(([key, value]) => [key, value * 2] as const))
```

`keys` and `toEntries` preserve the input key and value types for typed iteration. `fromEntries`
uses the standard last-entry-wins behavior for duplicate keys.

### MIME classification

```ts
import { classifyMimeType } from '@onderwijsin/directus-extension-utils'

const category = classifyMimeType(upload.mimeType)
if (category === 'image') await createImagePreview(upload)
```

Classification trims and compares case-insensitively. Unknown values return `'unknown'`; pass
`documentMimeTypes` when an extension supports additional document types.

### UUIDs

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

When supplied, the Pino logger is returned unchanged. Without one, `createLogger` provides a
Pino-like API backed by the corresponding console methods.

## Shutdown

Dispose resources owned by your extension during Directus shutdown:

```ts
handler.dispose() // cancels pending debounce timers
await storage.dispose() // closes provider resources, such as Redis
await locks.dispose() // only for a standalone Redis lock provider
```

[`dispose()`](extension-utils-glossary.md#handler-disposal) does not delete markers and does not
abort a task that is already running. The task should honor its
[`AbortSignal`](extension-utils-glossary.md#abort-signal) when the lease is lost. Dispose the
handler before the [storage](extension-utils-glossary.md#storage) that owns its resources.

## More detail

- [Glossary](extension-utils-glossary.md) — locks, leases, markers, tokens, renewal, and disposal.
- [API reference](../../.agents/skills/directus-extension-utils/references/api-reference.md) — full
  export and option reference for maintainers.
- [Package README](../../packages/extension-utils/README.md) — package-level contract and exports.
