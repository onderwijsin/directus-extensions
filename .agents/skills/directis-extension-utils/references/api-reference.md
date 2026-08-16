# @onderwijsin/directus-extension-utils API reference

This is the current source API. The root, /shared, and /app paths expose the shared surface.
The /server path exposes the shared surface plus filesystem adapters. Read the source export indexes
when a new API is added; this file is a maintainer reference, not a replacement for tests.

## Attempts

~~~ts
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
~~~

attemptWithRetry rejects invalid attempts values (positive safe integer required) and invalid
delayMs values (finite and non-negative). It returns the final failure as data after the attempt
budget is exhausted.

## Runtime guards

~~~ts
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
~~~

These are predicates, not coercion, parsing, diagnostics, or structured validation. isRecord accepts
non-null non-array objects. isNonEmptyString accepts whitespace; use isNonBlankString when
whitespace-only values should fail.

## Cache

~~~ts
interface CacheSetOptions {
  ttlMs?: number
}
interface CacheStore {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>
  delete(key: string): Promise<boolean>
  clear?(): Promise<void>
}
interface CacheNamespace {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>
  delete(key: string): Promise<boolean>
}
interface MemoryCacheOptions {
  now?: () => number
}
createMemoryCache(options?: MemoryCacheOptions): CacheStore
createNamespacedCache(store: CacheStore, namespace: string): CacheNamespace
~~~

Memory cache is process-local and uses a Map. An expired entry is removed on access. TTL is finite
and non-negative; 0 is immediately expired. The optional clear operation is available on the
memory store.

### Redis cache adapter

~~~ts
interface RedisCacheClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ...arguments_: unknown[]): Promise<unknown>
  del(key: string): Promise<number>
}
interface CacheCodec {
  serialize(value: unknown): string
  deserialize<T>(value: string): T
}
interface RedisCacheOptions {
  codec?: CacheCodec
}
createRedisCache(client: RedisCacheClient, options?: RedisCacheOptions): CacheStore
~~~

The adapter JSON-serializes values by default and writes TTLs with Redis SET ... PX. It does not
provide clear, create a connection, or close the client. Serialization and client errors propagate.
Supply a codec when the default JSON representation is unsuitable.

## Locks

~~~ts
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
}
const BULK_OPERATION_LOCK = 'bulk-operation'
interface MemoryLockProviderOptions {
  now?: () => number
  tokenFactory?: () => string
}
createMemoryLockProvider(options?: MemoryLockProviderOptions): LockProvider
~~~

Lock names are trimmed and must not be empty. The memory provider is process-local. Lease renewal
and release are owner-bound and idempotent; they return false for an expired, released, or replaced
generation.

### Redis lock adapter

~~~ts
interface RedisLockClient {
  set(key: string, value: string, ...arguments_: unknown[]): Promise<unknown>
  eval(script: string, numberOfKeys: number, ...arguments_: unknown[]): Promise<unknown>
}
interface RedisLockProviderOptions {
  keyPrefix?: string // default extension-utils:lock:
  tokenFactory?: () => string
}
createRedisLockProvider(
  client: RedisLockClient,
  options?: RedisLockProviderOptions,
): LockProvider
~~~

Redis acquisition uses SET key token PX lease NX; renewal and release verify the token through Lua
scripts. The client is injected and remains owned by the caller.

## Auto-task coordination

~~~ts
interface AutoTaskMarker {
  generation: number
  updatedAt: number
}
interface AutoTaskMarkerStore {
  touch(identifier: string, updatedAt: number): Promise<AutoTaskMarker>
  get(identifier: string): Promise<AutoTaskMarker | undefined>
  clear(identifier: string, generation: number): Promise<boolean>
}
createMemoryAutoTaskMarkerStore(): AutoTaskMarkerStore

interface RedisAutoTaskMarkerClient {
  get(key: string): Promise<string | null>
  eval(script: string, numberOfKeys: number, ...arguments_: unknown[]): Promise<unknown>
}
interface RedisAutoTaskMarkerStoreOptions {
  keyPrefix?: string // default extension-utils:auto-task:
}
createRedisAutoTaskMarkerStore(
  client: RedisAutoTaskMarkerClient,
  options?: RedisAutoTaskMarkerStoreOptions,
): AutoTaskMarkerStore
~~~

The Redis marker adapter atomically increments generations and clears only the requested generation.
It does not create or close the client. Marker timestamps must be finite.

~~~ts
interface AutoTaskScheduler {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
  setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>
  clearInterval(handle: ReturnType<typeof setInterval>): void
}
interface AutoTaskHandlerOptions {
  debounceId: string
  task: (signal: AbortSignal) => Promise<void> | void
  lockProvider: LockProvider
  logger?: LoggerLike
  debounceMs?: number             // default 15_000
  markerLeaseMs?: number          // default 5 minutes
  taskLeaseMs?: number            // default 5 minutes
  retryMs?: number                // default debounceMs
  renewalIntervalMs?: number      // default taskLeaseMs / 2
  now?: () => number
  markerStore?: AutoTaskMarkerStore
  scheduler?: AutoTaskScheduler
  onError?: (error: unknown) => void | Promise<void>
  lockName?: string               // default BULK_OPERATION_LOCK
}
interface AutoTaskHandler {
  (): Promise<void>
  dispose(): void
}
createAutoTaskHandler(options: AutoTaskHandlerOptions): AutoTaskHandler
~~~

The handler schedules the latest marker generation, retries on lock contention, renews the task
lease, and aborts the task when renewal fails. It does not acknowledge a generation after lease
loss. onError is best-effort; failures from it are logged and do not reject the trigger.

## Server-only filesystem adapters

~~~ts
interface FileLockProviderOptions {
  directory: string
  now?: () => number
  tokenFactory?: () => string
}
createFileLockProvider(options: FileLockProviderOptions): LockProvider

interface FileAutoTaskMarkerStoreOptions {
  directory: string
  lockProvider?: LockProvider
  operationLeaseMs?: number // default 5_000; finite and positive
}
createFileAutoTaskMarkerStore(options: FileAutoTaskMarkerStoreOptions): AutoTaskMarkerStore
~~~

These functions are exported only from /server. They require a non-empty explicit directory.
Filesystem locks and markers coordinate processes only when the directory is shared. The marker
store serializes operations with a filesystem lock provider by default.

## MIME classification

~~~ts
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
~~~

Values are trimmed and compared case-insensitively. Text types are documents. Unknown values return
unknown; custom document MIME types extend the default registry.

## Logging

~~~ts
interface Logger {
  trace?(message: string, fields?: Record<string, unknown>): void
  debug?(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}
type LoggerLike = Partial<Logger>
createLogger(logger?: LoggerLike): Logger
~~~

Missing methods fall back independently to the corresponding console method. info, warn, and error
are required on the returned logger.

## Object helpers

~~~ts
toEntries<T extends object>(value: T): [keyof T, T[keyof T]][]
fromEntries<K extends PropertyKey, V>(
  entries: Iterable<readonly [K, V]>,
): Record<K, V>
keys<T extends object>(value: T): (keyof T)[]
~~~

toEntries and keys use own enumerable string keys. fromEntries follows standard last-entry-wins
behavior for duplicate keys.

## UUIDs and types

~~~ts
const UUID_NAMESPACE_URL: string
generateUUID(): string
generateDeterministicUUID(input: string, namespace?: string): string

type PartialNested<T>
type LngLatCoordinates = [longitude: number, latitude: number]
type Geometry
~~~

generateUUID returns UUID v4. generateDeterministicUUID returns UUID v5 and defaults to
UUID_NAMESPACE_URL. PartialNested recursively makes object properties optional while preserving
functions and constructors. Geometry covers GeoJSON Point, LineString, Polygon, MultiPoint,
MultiLineString, and MultiPolygon.
