import type { LockProvider } from '../lock/lock-core'
import type { LoggerLike } from '../logger'

/** A marker identifying the latest trigger generation. */
export interface AutoTaskMarker {
	/** Monotonically increasing generation for a debounce identifier. */
	generation: number
	/** Timestamp at which the generation was triggered. */
	updatedAt: number
}

/** Storage required to share debounce markers across handler instances or processes. */
export interface AutoTaskMarkerStore {
	/** Atomically creates or updates a marker and returns its new generation. */
	touch(identifier: string, updatedAt: number): Promise<AutoTaskMarker>
	/** Reads the current marker, or `undefined` when no marker exists. */
	get(identifier: string): Promise<AutoTaskMarker | undefined>
	/** Removes a marker only when it still has the supplied generation. */
	clear(identifier: string, generation: number): Promise<boolean>
}

/** Timer boundary used to make scheduling deterministic in tests and specialized runtimes. */
export interface AutoTaskScheduler {
	setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
	clearTimeout(handle: ReturnType<typeof setTimeout>): void
	setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>
	clearInterval(handle: ReturnType<typeof setInterval>): void
}

/** Configuration for a debounced, lock-protected task handler. */
export interface AutoTaskHandlerOptions {
	/** Unique marker identifier, such as `schema-snapshot`. */
	taskId: string
	/** Work to execute after the debounce window. The signal aborts when the lease is lost. */
	task: (signal: AbortSignal) => Promise<void> | void
	/** Lock and marker storage used to coordinate task executions. */
	storage: TaskHandlerStorage
	/** Optional logger for lifecycle messages. */
	logger?: LoggerLike
	/** Debounce window in milliseconds. Defaults to 15 seconds. */
	debounceMs?: number
	/** Maximum age of a pending trigger generation. Defaults to 5 minutes. */
	markerLeaseMs?: number
	/** Lease duration for the execution lock. Defaults to 5 minutes. */
	taskLeaseMs?: number
	/** Delay before retrying after lock contention. Defaults to `debounceMs`. */
	retryMs?: number
	/** Renewal interval. Defaults to half of `taskLeaseMs`. */
	renewalIntervalMs?: number
	/** Clock returning milliseconds since epoch. */
	now?: () => number
	/** Scheduler boundary. */
	scheduler?: AutoTaskScheduler
	/** Receives task, lock, marker, and renewal failures. */
	onError?: (error: unknown) => void | Promise<void>
}

/** A trigger function with an explicit timer cleanup operation. */
export interface AutoTaskHandler {
	/** Records a trigger and schedules the latest generation. */
	(): Promise<void>
	/** Cancels pending timers; an already-running task is allowed to finish. */
	dispose(): void
}

/** The coordinated state required by an auto-task handler. */
export interface TaskHandlerStorage {
	/** Lock used to ensure only one task owner runs at a time. */
	lockProvider: LockProvider
	/** Marker store used to share the latest trigger generation. */
	markerStore: AutoTaskMarkerStore
	/** Releases resources owned by this storage. */
	dispose(): Promise<void>
}

/** Options for process-local auto-task storage. */
export interface MemoryTaskHandlerStorageOptions {
	/** Default lock lifetime when a task lease omits `leaseMs`. Defaults to 30 seconds. */
	lockTimeoutMs?: number
	/** Injectable clock for deterministic tests. */
	now?: () => number
	/** Injectable owner-token factory for deterministic tests. */
	tokenFactory?: () => string
}

/** Options for the Directus KV-backed marker store. */
export interface DirectusAutoTaskMarkerStoreOptions {
	/** Namespace used for marker and generation keys. */
	namespace?: string
}

/** Options for the explicit local-filesystem marker store. */
export interface FsAutoTaskMarkerStoreOptions {
	/** Directory shared by the processes that should share debounce markers. */
	directory: string
	/** Optional provider used to serialize marker updates. */
	lockProvider?: LockProvider
	/** Lock lifetime used for one marker read/update operation. Defaults to five seconds. */
	lockTimeoutMs?: number
}

/** Options for Redis-backed auto-task storage. */
export interface RedisTaskHandlerStorageOptions {
	/** Redis connection URL. The storage owns the created connection. */
	redisUrl: string
	/** Namespace shared by the lock and marker stores. Defaults to `directus:task-handler`. */
	namespace?: string
	/** Default execution lock lifetime in milliseconds. Defaults to 5 minutes. */
	lockTimeoutMs?: number
	/** Identifies backend errors that represent lock contention. */
	isContentionError?: (error: unknown) => boolean
}

/** Options for filesystem-backed auto-task storage. */
export interface FsTaskHandlerStorageOptions {
	/** Directory shared by the processes that coordinate the task. */
	directory: string
	/** Injectable clock for deterministic tests. */
	now?: () => number
	/** Injectable owner-token factory for deterministic tests. */
	tokenFactory?: () => string
	/** Default lock lifetime used by filesystem marker operations. Defaults to five seconds. */
	lockTimeoutMs?: number
}
