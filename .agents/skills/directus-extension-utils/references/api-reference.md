# @onderwijsin/directus-extension-utils API reference

This is the current source API for Directus extensions. For lock and task vocabulary, read the
[utility glossary](../../../../docs/extension-cookbook/extension-utils-glossary.md). The root, /shared,
and /app paths expose the browser-safe common surface. The /server path exposes that surface plus
Directus-runtime utilities. Read the source export indexes
when a new API is added; this file is a maintainer reference, not a replacement for tests.

## Directus hooks

The `@onderwijsin/directus-extension-utils/hook` subpath exports `defineHook` with corrected
asynchronous action-handler types. Use this subpath for hook entrypoints so consumers that only
import `/server` utilities do not load `@directus/extensions-sdk` through the hook helper.

For type-only consumers, import `ActionHandler`, `RegisterFunctions`, or `HookConfig` from
`@onderwijsin/directus-extension-utils/types`. The `/types` subpath has no hook runtime import.

```ts
import { defineHook } from '@onderwijsin/directus-extension-utils/hook'

export default defineHook((hook) => {
	hook.action('items.create', async () => {
		await doWork()
	})
})
```

## Attempts

```ts
type AttemptResult<T> =
  | { data: T; error: null }
  | { data: null; error: unknown }

interface AttemptRetryOptions {
  attempts?: number              // default 3; total executions
  delayMs?: number               // default 250; initial delay
  exponentialBackoff?: boolean   // default true
}

attempt<T>(operation: () => T | Promise<T>): Promise<AttemptResult<T>>
attemptSync<T>(operation: () => T): AttemptResult<T>
attemptWithRetry<T>(
  operation: () => T | Promise<T>,
  options?: AttemptRetryOptions,
): Promise<AttemptResult<T>>
```

attemptWithRetry rejects invalid attempts values (positive safe integer required) and invalid
delayMs values (finite and non-negative). It returns the final failure as data after the attempt
budget is exhausted.

## Async Express handlers

```ts
type AsyncRequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void>

asyncHandler(handler: AsyncRequestHandler): RequestHandler
```

`asyncHandler` is exported from `@onderwijsin/directus-extension-utils/server`. It invokes an
asynchronous Express 4 handler and forwards a rejected promise to `next(error)`, while returning a
normal synchronous `RequestHandler` to the router. Middleware remains responsible for calling
`next()` after its asynchronous work completes.

## Accountability helpers

```ts
isAccountability(value: unknown): value is Accountability
hasAuthenticatedUser(value: unknown): value is Accountability & { user: string }
assertRequestWithAccountability(
  request: Request,
): request is Request & { accountability: Accountability }
getAccountabilityFromRequest(request: Request): Accountability | null
```

These server-only helpers structurally narrow Directus accountability data at API boundaries:

- `isAccountability` checks the minimum accountability fields exposed by the utility.
- `hasAuthenticatedUser` additionally requires a string `user` value.
- `assertRequestWithAccountability` narrows the request object when the accountability property is
  required.
- `getAccountabilityFromRequest` returns a validated accountability or `null` without changing the
  request's inferred type.

They are type guards and boundary helpers, not complete schema validators. Use Zod when complete
external validation and diagnostics are required.

## Runtime guards

```ts
isDefined<T>(value: T): value is Exclude<T, undefined>
isRecord(value: unknown): value is Record<string, unknown>
isArray(value: unknown): value is unknown[]
isString(value: unknown): value is string
isNonEmptyString(value: unknown): value is string
isNonBlankString(value: unknown): value is string
isNumber(value: unknown): value is number
isFiniteNumber(value: unknown): value is number
isInteger(value: unknown): value is number
isBoolean(value: unknown): value is boolean
isFunction(value: unknown): value is (...args: never[]) => unknown
hasKeys(value: Record<string, unknown>): boolean
hasKey<Key extends PropertyKey>(
  value: Record<string, unknown>,
  key: Key,
): value is Record<Key, unknown>
```

These are predicates, not coercion, parsing, diagnostics, or structured validation. isRecord accepts
non-null non-array objects. isNonEmptyString accepts whitespace; use isNonBlankString when
whitespace-only values should fail.

## Directus memory

Use `createCache` for disposable derived data and `createKv` for coordination state. Both are
provided by `@directus/memory` and support local and Redis-backed stores. `Kv` additionally exposes
`increment`, `acquireLock`, and `usingLock`.

## Server-only configuration

```ts
cacheConfigSchema
redisConfigSchema
emailConfigSchema
requiredEmailConfigSchema
resolveRedisConnectionString(options: RedisConfig): string | undefined
resolveCacheStorage(options: CacheConfig): 'memory' | 'redis' | null
isEmailConfigured(options: unknown): boolean
```

`REDIS` takes precedence over `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, and `REDIS_PASSWORD`.
Component-based resolution requires `REDIS_ENABLED=true` (or `SYNCHRONIZATION_STORE=redis`) and all four values, and credentials are
percent-encoded. Cache storage keeps the public `memory` value; `initializeCache` maps it to the
memory package's local backend internally. The base email schema is optional and supplies Directus
defaults; the required schema validates the selected `sendmail`, `smtp`, `mailgun`, or `ses`
transport.

## Server-only cache-aside helpers

```ts
type CacheEnv = z.input<typeof cacheConfigSchema>

interface CacheOptions {
  ttl: number // finite and positive
}

interface WithCacheOptions {
  cache: Cache | null
  key: string
}

type CollectionInput = string | string[] | {
  collection: string
  create?: boolean
  update?: boolean
  delete?: boolean
  isSystem?: boolean
}

interface CollectionCacheInvalidationOptions {
  cache: Cache | null
  key: (collection: string) => string
}

initializeCache(env: CacheEnv, options: CacheOptions): Cache | null
withCache<TResult>(
  options: WithCacheOptions,
  handler: () => Promise<TResult>,
): Promise<TResult>
registerCollectionCacheInvalidation(
  collection: CollectionInput,
  options: CollectionCacheInvalidationOptions,
  hook: RegisterFunctions,
  context: ApiExtensionContext,
): void
```

`initializeCache` validates the cache environment and maps the public `memory` storage to
`@directus/memory`'s local backend. It returns `null` when caching is disabled. Redis initialization
creates an `ioredis` client owned by the returned Directus cache; consumers should not create a
second client for the same cache instance. `CacheOptions.namespace` isolates Redis keys and makes
`clear()` namespace-scoped. Local caches have a private store per initialized instance; namespaces
do not make local instances share data.

`withCache` uses the explicit key for cache reads and writes. On a hit it returns the cached value
and does not call the handler. On a miss it calls the zero-argument handler and stores the resolved
value. With `cache: null`, the handler always runs and no cache methods are called. Consumers should
construct stable extension-specific keys. `initializePolicyCache` creates the Redis-only policy
cache once at extension startup; invalid or absent Redis configuration returns `null`. Pass that
cache to policy helpers so request handling never initializes Redis clients. The policy endpoint
and invalidation hook share the `directus:policies` namespace.

`registerCollectionCacheInvalidation` maps collection input to Directus action events and deletes
the exact key returned by the supplied key function. It skips registration for a null cache and
logs deletion failures without failing the originating mutation. It does not invalidate unrelated
keys or provide cross-process coordination unless the cache backend is shared.

## Server-only locks

```ts
interface LockAcquireOptions {
  leaseMs?: number // default 30_000; finite and positive
}
interface LockLease {
  readonly name: string
  readonly token: string
  renew(): Promise<boolean>
  release(): Promise<boolean>
}
interface LockProvider {
  tryAcquire(name: string, options?: LockAcquireOptions): Promise<LockLease | null>
  isLocked(name: string): Promise<boolean>
}
interface LockProviderOptions {
  defaultLeaseMs?: number
  tokenFactory?: () => string
}
interface MemoryLockProviderOptions extends LockProviderOptions {
  providerId?: string
  now?: () => number
}
createMemoryLockProvider(options?: MemoryLockProviderOptions): LockProvider
interface RedisLockProviderOptions extends LockProviderOptions {
  redisUrl: string
  namespace?: string
  defaultLeaseMs?: number
  isContentionError?: (error: unknown) => boolean
}
interface RedisLockProvider extends LockProvider {
  dispose(): Promise<void>
}
createRedisLockProvider(options: RedisLockProviderOptions): RedisLockProvider
```

Lock names are trimmed and must not be empty. All providers use `defaultLeaseMs` when `tryAcquire`
does not receive `leaseMs`. The memory provider is process-local and shares state between providers
with the same `providerId`; different IDs isolate lock namespaces. Lease renewal and release are
owner-bound and idempotent; they return false for an expired, released, or replaced generation.

## Server-only auto-task coordination

```ts
interface AutoTaskMarker {
  generation: number
  updatedAt: number
}
interface AutoTaskMarkerStore {
  touch(identifier: string, updatedAt: number): Promise<AutoTaskMarker>
  get(identifier: string): Promise<AutoTaskMarker | undefined>
  clear(identifier: string, generation: number): Promise<boolean>
}
createMemoryMarkerStore(): AutoTaskMarkerStore
interface RedisMarkerStoreOptions {
  redisUrl: string
  namespace?: string
  lockTimeoutMs?: number // default 5_000
}
createRedisMarkerStore(options: RedisMarkerStoreOptions): AutoTaskMarkerStore & {
  dispose(): Promise<void>
}
```

The Directus marker adapter uses `Kv.increment` and `Kv.usingLock` to update generations safely.
Marker timestamps must be finite.

## Shared constants

```ts
const deploymentEnvs: readonly ['development', 'staging', 'production']
type DEPLOYMENT_ENV = 'development' | 'staging' | 'production'
```

Import these values from `/constants`. Use `deploymentEnvs` in Zod environment schemas and
`DEPLOYMENT_ENV` for TypeScript annotations.

## Server-only extension setup

```ts
interface ExtensionSetup {
  start(): void
  end(): void
  isEnabled(): boolean
}
extensionSetup<ENV extends Record<string, unknown>>(
  extensionName: string,
  env: ENV,
  logger: Logger,
): ExtensionSetup

validateExtensionOptions<S extends ZodType>(
  options: unknown,
  schema: S,
  logger: Logger,
): z.output<S>
```

`extensionSetup` logs lifecycle messages and treats missing or true `<EXTENSION_NAME>_ENABLED`
values as enabled. The string `"false"` and boolean `false` disable the extension.
`validateExtensionOptions` logs Zod's formatted error and throws `Invalid extension options ☝.
Exiting.` when parsing fails.

## Server-only schema management

```ts
withCollectionIdentity(
  name: string,
  schema: DirectusSchemaDefinition,
): DirectusSchemaDefinition
```

Replaces the first collection identity throughout typed collection, field, and relation references.
The schema must contain at least one collection.

```ts
const startupLockProviderSchema = z.enum(['memory', 'redis', 'fs'])

const directusStartupSchema = z.object({
  DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
  DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: z.boolean().default(true),
  DIRECTUS_EXTENSIONS_LOCK_PROVIDER: startupLockProviderSchema.optional(),
  DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: z.string().trim().min(1).optional(),
  DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: z.string().trim().min(1).optional(),
})
  // REDIS requires LOCK_REDIS_URL; FS requires LOCK_FS_DIRECTORY.

type DirectusStartupOptions = z.output<typeof directusStartupSchema>

const DIRECTUS_EXTENSION_STARTUP_LOCK = 'directus-extension-startup'
getDirectusStartupLockName(name: string): string
```

`directusStartupSchema` validates the global enablement and provider settings. Extend it with
`.extend(...)` so its conditional Redis and filesystem requirements remain active:

```ts
const envSchema = directusStartupSchema.extend({
  ORDERS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
})
```

```ts
interface DirectusStartupLockProvider {
  provider: LockProvider
  dispose(): Promise<void>
}

createStartupLockProvider(
  options: DirectusStartupOptions,
): DirectusStartupLockProvider
```

The factory selects the memory, Redis, or filesystem provider from
`DIRECTUS_EXTENSIONS_LOCK_PROVIDER`. It owns and disposes Redis providers that it creates. An
explicit `options.lockProvider` passed to `ensureDirectusSchema` remains owned by the consumer.

```ts
interface DirectusSchemaDefinition {
  collections: RawCollection[]
  fields: RawField[]
  relations: Partial<Relation>[]
}

`validateSchemaDefinition` validates bundled JSON at the boundary and returns a typed
`DirectusSchemaDefinition`:

```ts
const definition = validateSchemaDefinition(bundledSchema)
```

interface EnsureDirectusSchemaOptions {
  abortOnError?: boolean // default true
  lockProvider?: LockProvider
  lockProviderConfig?: DirectusStartupOptions
  lockLeaseMs?: number
}

interface EnsureDirectusSchemaInput {
  id: string
  database: ApiExtensionContext['database']
  getSchema: (options?: {
    database?: ApiExtensionContext['database']
    bypassCache?: boolean
  }) => Promise<SchemaOverview>
  logger: LoggerLike
  definition: DirectusSchemaDefinition
  services: ApiExtensionContext['services']
  options?: EnsureDirectusSchemaOptions
}

interface EnsureDirectusSchemaResult {
  changed: string[]
  skipped: boolean
}

ensureDirectusSchema(
  input: EnsureDirectusSchemaInput,
): Promise<EnsureDirectusSchemaResult>

interface BaseEnsureInput {
  id: string
  database: ApiExtensionContext['database']
  getSchema: (options?: {
    database?: ApiExtensionContext['database']
    bypassCache?: boolean
  }) => Promise<SchemaOverview>
  logger: LoggerLike
  services: ApiExtensionContext['services']
  options?: BaseEnsureOptions
}

interface EnsureDirectusPolicyInput extends BaseEnsureInput {
  definition: Policy
}

ensureDirectusPolicy(
  input: EnsureDirectusPolicyInput,
): Promise<EnsureDirectusSchemaResult>

type DirectusStartupStatusOptions = Pick<
  BaseEnsureOptions,
  'lockProvider' | 'lockProviderConfig'
>

interface DirectusStartupStatusInput {
  id: string
  options?: DirectusStartupStatusOptions
}

interface DirectusStartupStatus {
  isLocked: boolean
}

getDirectusStartupStatus(
  input: DirectusStartupStatusInput,
): Promise<DirectusStartupStatus>
```

Collection definitions must include a non-blank `schema.name` and a primary-key field in the
collection's nested `fields` array. The primary-key field must not be repeated in the top-level
`fields` array. Definitions missing either requirement are logged as incompatible and preserved
without calling the collection service.

`ensureDirectusSchema` passes the supplied database into `getSchema` and Directus service
constructors. It creates missing collections, fields, and relations. Existing compatible resources
are preserved; incompatible structural resources are logged and left unchanged. UI metadata is not
authoritative and is not overwritten. Each ensure emits an info-level plan and summary; per-resource
and lock lifecycle details use debug-level logging. Unexpected service failures are logged and
re-thrown by default; set `abortOnError: false` to continue.

`getDirectusStartupStatus` checks the shared startup lock read-only. It never acquires, renews,
releases, or repairs a lock. Use the same `id` and provider configuration as the startup
coordinator. Memory providers with the same `providerId` can observe one another within the process.
Providers created from `lockProviderConfig` are disposed after the status query, while
an explicitly supplied `lockProvider` remains owned by the consumer.

```ts
type ActionRegistrar = (
  event: 'server.start',
  handler: () => void,
) => void

interface CreateDirectusStartupCoordinatorOptions {
  id: string
  name: string
  disabled: boolean
  disabledGlobally: boolean
  dataDisabledGlobally?: boolean
  lockProvider?: LockProvider
  lockProviderConfig?: DirectusStartupOptions
  lockLeaseMs?: number
}

interface DirectusStartupContext {
  lockProvider: LockProvider
}

interface DirectusStartupCoordinator {
  schema(callback: (context: DirectusStartupContext) => Promise<void>): void
  data(callback: (context: DirectusStartupContext) => Promise<void>): void
}

createDirectusStartupCoordinator(
  action: ActionRegistrar,
  logger: LoggerLike,
  options: CreateDirectusStartupCoordinatorOptions,
): DirectusStartupCoordinator
```

The startup coordinator performs the global and extension-specific disabled checks, invokes one
ordered `server.start` plan, runs all schema callbacks before data callbacks, and logs asynchronous
setup failures without rejecting action registration. The context's held provider must be passed to
nested ensure calls.

Schema-change configuration summary:

| Key | Default | Validation/behavior |
| --- | --- | --- |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` | `true` | Global master switch. |
| `SYNCHRONIZATION_STORE` | `memory` | Global fallback for synchronization-related extension stores. |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER` | absent | Enum: `memory`, `redis`, `fs`; otherwise follows synchronization. |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL` | absent | Optional override; otherwise uses resolved Redis settings. |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY` | absent | Required for `fs`. |

`ensureDirectusSchema` returns stable resource identifiers in `changed` and reports lock contention as
`skipped: true`. It only creates missing resources. Compatibility checks are structural: collection
identity, field type, and relation endpoints. It never overwrites UI metadata, and it preserves an
incompatible existing resource after logging an error. Use `abortOnError: false` only for a deliberate
best-effort setup; it applies to unexpected service failures, not to incompatible resources.

```ts
interface TaskHandlerStorage {
  lockProvider: LockProvider
  markerStore: AutoTaskMarkerStore
  dispose(): Promise<void>
}
interface MemoryTaskHandlerStorageOptions {
  lockTimeoutMs?: number // default 30 seconds
  now?: () => number
  tokenFactory?: () => string
}
createMemoryTaskHandlerStorage(options?: MemoryTaskHandlerStorageOptions): TaskHandlerStorage
```

```ts
interface AutoTaskScheduler {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
  setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>
  clearInterval(handle: ReturnType<typeof setInterval>): void
}
interface AutoTaskHandlerOptions {
  taskId: string
  task: (signal: AbortSignal) => Promise<void> | void
  storage: TaskHandlerStorage
  logger?: LoggerLike
  debounceMs?: number             // default 15_000
  markerLeaseMs?: number          // default 5 minutes
  taskLeaseMs?: number            // default 5 minutes
  retryMs?: number                // default debounceMs
  renewalIntervalMs?: number      // default taskLeaseMs / 2
  now?: () => number
  scheduler?: AutoTaskScheduler
  onError?: (error: unknown) => void | Promise<void>
}
interface AutoTaskHandler {
  (): Promise<void>
  dispose(): void
}
createAutoTaskHandler(options: AutoTaskHandlerOptions): AutoTaskHandler
```

The handler schedules the latest marker generation, retries on lock contention, renews the task
lease, and aborts the task when renewal fails. `markerLeaseMs` limits how long a pending generation
remains eligible; `taskLeaseMs` controls the execution lock lifetime. They default to five minutes
and are independent. A successful task acknowledges its matching generation; task failures and lease
loss do not acknowledge it, so the marker remains pending for a later trigger. The handler does not
automatically retry failed tasks. `onError` is best-effort; failures from it are logged and do not
reject the trigger.

Handler durations must be finite. `debounceMs`, `markerLeaseMs`, and `retryMs` accept zero or a
positive value; `taskLeaseMs` and `renewalIntervalMs` must be positive. `taskId` must be non-blank.

`handler.dispose()` is synchronous and cancels pending debounce/retry timers; it does not abort a
task that is already running or clear its marker. `storage.dispose()` releases resources owned by
the storage, such as a Redis connection. Dispose the handler before the storage. Memory and
filesystem storage currently implement disposal as a no-op.

## Server-only filesystem adapters

```ts
interface FsLockProviderOptions {
  directory: string
  defaultLeaseMs?: number
  now?: () => number
  tokenFactory?: () => string
}
createFsLockProvider(options: FsLockProviderOptions): LockProvider

interface FsMarkerStoreOptions {
  directory: string
  lockProvider?: LockProvider
  lockTimeoutMs?: number // default 5_000; finite and positive
}
createFsMarkerStore(options: FsMarkerStoreOptions): AutoTaskMarkerStore

interface FsTaskHandlerStorageOptions {
  directory: string
  now?: () => number
  tokenFactory?: () => string
  lockTimeoutMs?: number // default 5_000
}
createFsTaskHandlerStorage(options: FsTaskHandlerStorageOptions): TaskHandlerStorage

interface RedisTaskHandlerStorageOptions {
  redisUrl: string
  namespace?: string // default directus:task-handler
  lockTimeoutMs?: number // default 5 minutes
  isContentionError?: (error: unknown) => boolean
}
createRedisTaskHandlerStorage(options: RedisTaskHandlerStorageOptions): TaskHandlerStorage
```

When supplied, `lockTimeoutMs` must be finite and positive. Redis task storage uses it for both
marker-operation locking and the default execution-lock configuration; the handler still passes its
explicit `taskLeaseMs` for task execution. Filesystem task storage uses it for marker operations and
passes it to the shared filesystem provider when configured. `createMemoryMarkerStore().touch()`
and all persistent marker stores reject non-finite `updatedAt` values.

Marker writes preserve each generation. Memory writes are process-local, Redis writes are
serialized by the backend KV lock, and filesystem writes are serialized per identifier within a
store instance and protected by the shared filesystem lock across processes.

These functions are exported only from /server. Filesystem factories require a non-empty explicit
directory and coordinate processes only when that directory is shared. The filesystem marker store
serializes operations with a filesystem lock provider by default. Redis storage owns its Redis
connection and should be disposed during server shutdown.

## MIME classification

```ts
type MimeTypeCategory = 'audio' | 'video' | 'image' | 'document' | 'unknown'
type FileType = MimeTypeCategory
const DEFAULT_DOCUMENT_MIME_TYPES: readonly string[]
interface MimeTypeClassificationOptions {
  documentMimeTypes?: readonly string[]
}
isAudioMimeType(mimeType: unknown): boolean
isVideoMimeType(mimeType: unknown): boolean
isImageMimeType(mimeType: unknown): boolean
isDocumentMimeType(
  mimeType: unknown,
  options?: MimeTypeClassificationOptions,
): boolean
classifyMimeType(
  mimeType: unknown,
  options?: MimeTypeClassificationOptions,
): MimeTypeCategory
const getFileType: typeof classifyMimeType
```

Values are trimmed and compared case-insensitively. Text types are documents. Unknown values return
unknown; custom document MIME types extend the default registry.

## Server-only logging

```ts
type Logger = import('pino').Logger
type LoggerLike = Pick<Logger, 'info' | 'warn' | 'error'> &
  Partial<Pick<Logger, 'debug' | 'trace'>>
createLogger(logger?: LoggerLike): LoggerLike
```

When a logger is supplied, it is returned unchanged. Without one, the fallback forwards each method
to the corresponding console method. info, warn, and error are required; debug and trace are optional.

## Sentry browser type

The explicit `/sentry` entrypoint also exports the minimal browser contract used by extensions whose
Sentry client is provided by an embedded loader:

```ts
interface SentryBrowser {
  captureException(error: unknown): string | undefined
}
```

## Object helpers

```ts
toEntries<T extends object>(value: T): [keyof T, T[keyof T]][]
fromEntries<K extends PropertyKey, V>(
  entries: Iterable<readonly [K, V]>,
): Record<K, V>
keys<T extends object>(value: T): (keyof T)[]
```

toEntries and keys use own enumerable string keys. fromEntries follows standard last-entry-wins
behavior for duplicate keys.

## UUIDs and types

```ts
const UUID_NAMESPACE_URL: string
uuid(): string
uuid(input: string, namespace?: string): string
uuidv4(): string

type PartialNested<T>
```

uuid() returns UUID v7. When given an input, uuid() returns a deterministic UUID v5 and defaults to
UUID_NAMESPACE_URL. uuidv4() returns UUID v4. PartialNested recursively makes object properties
optional while preserving functions and constructors.
