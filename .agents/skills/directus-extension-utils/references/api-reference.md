# @onderwijsin/directus-extension-utils API reference

This is the current source API for Directus extensions. For lock and task vocabulary, read the
[utility glossary](../../../../docs/extension-cookbook/extension-utils-glossary.md). The root, /shared,
and /app paths expose the browser-safe common surface. The /server path exposes that surface plus
Directus-runtime utilities. Read the source export indexes
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

## Directus memory

Use `createCache` for disposable derived data and `createKv` for coordination state. Both are
provided by `@directus/memory` and support local and Redis-backed stores. `Kv` additionally exposes
`increment`, `acquireLock`, and `usingLock`.

## Server-only locks

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
interface LockProviderOptions {
  defaultLeaseMs?: number
  tokenFactory?: () => string
}
interface MemoryLockProviderOptions extends LockProviderOptions {
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
~~~

Lock names are trimmed and must not be empty. All providers use `defaultLeaseMs` when `tryAcquire`
does not receive `leaseMs`. The memory provider is process-local. Lease renewal and release are
owner-bound and idempotent; they return false for an expired, released, or replaced generation.

## Server-only auto-task coordination

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
createDirectusAutoTaskMarkerStore(
  kv: Kv,
  options?: { namespace?: string },
): AutoTaskMarkerStore
~~~

The Directus marker adapter uses `Kv.increment` and `Kv.usingLock` to update generations safely.
Marker timestamps must be finite.

~~~ts
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
~~~

~~~ts
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
~~~

The handler schedules the latest marker generation, retries on lock contention, renews the task
lease, and aborts the task when renewal fails. `markerLeaseMs` limits how long a pending generation
remains eligible; `taskLeaseMs` controls the execution lock lifetime. They default to five minutes
and are independent. It does not acknowledge a generation after lease loss. onError is best-effort;
failures from it are logged and do not reject the trigger.

`handler.dispose()` is synchronous and cancels pending debounce/retry timers; it does not abort a
task that is already running or clear its marker. `storage.dispose()` releases resources owned by
the storage, such as a Redis connection. Dispose the handler before the storage. Memory and
filesystem storage currently implement disposal as a no-op.

## Server-only filesystem adapters

~~~ts
interface FsLockProviderOptions {
  directory: string
  defaultLeaseMs?: number
  now?: () => number
  tokenFactory?: () => string
}
createFsLockProvider(options: FsLockProviderOptions): LockProvider

interface FsAutoTaskMarkerStoreOptions {
  directory: string
  lockProvider?: LockProvider
  lockTimeoutMs?: number // default 5_000; finite and positive
}
createFsAutoTaskMarkerStore(options: FsAutoTaskMarkerStoreOptions): AutoTaskMarkerStore

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
~~~

These functions are exported only from /server. Filesystem factories require a non-empty explicit
directory and coordinate processes only when that directory is shared. The filesystem marker store
serializes operations with a filesystem lock provider by default. Redis storage owns its Redis
connection and should be disposed during server shutdown.

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

## Server-only logging

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
uuid(): string
uuid(input: string, namespace?: string): string
uuidv4(): string

type PartialNested<T>
~~~

uuid() returns UUID v7. When given an input, uuid() returns a deterministic UUID v5 and defaults to
UUID_NAMESPACE_URL. uuidv4() returns UUID v4. PartialNested recursively makes object properties
optional while preserving functions and constructors.
