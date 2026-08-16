import { BULK_OPERATION_LOCK, type LockProvider } from './lock.js'
import { createLogger, type LoggerLike } from './logger.js'

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

/**
 * Creates a process-local debounce marker store for one or more handlers.
 * @returns A marker store backed by a process-local map.
 */
export function createMemoryAutoTaskMarkerStore(): AutoTaskMarkerStore {
	const markers = new Map<string, AutoTaskMarker>()

	return {
		touch: (identifier, updatedAt) =>
			Promise.resolve().then(() => {
				const marker = {
					generation: (markers.get(identifier)?.generation ?? 0) + 1,
					updatedAt,
				}
				markers.set(identifier, marker)
				return marker
			}),
		get: (identifier) => Promise.resolve(markers.get(identifier)),
		clear: (identifier, generation) =>
			Promise.resolve().then(() => {
				if (markers.get(identifier)?.generation !== generation) return false
				markers.delete(identifier)
				return true
			}),
	}
}

/** Minimal Redis-compatible client required by the distributed marker store. */
export interface RedisAutoTaskMarkerClient {
	get(key: string): Promise<string | null>
	eval(script: string, numberOfKeys: number, ...arguments_: unknown[]): Promise<unknown>
}

/** Options for the Redis-backed marker store. */
export interface RedisAutoTaskMarkerStoreOptions {
	/** Prefix shared by marker keys created by this store. */
	keyPrefix?: string
}

const TOUCH_MARKER_SCRIPT =
	"local generation = redis.call('incr', KEYS[1]); redis.call('set', KEYS[2], generation .. ':' .. ARGV[1]); return generation"
const CLEAR_MARKER_SCRIPT =
	"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[2]) else return 0 end"

const validateMarker = (value: AutoTaskMarker, source: string): AutoTaskMarker => {
	if (
		!Number.isSafeInteger(value.generation) ||
		value.generation < 1 ||
		!Number.isFinite(value.updatedAt)
	) {
		throw new Error(`Invalid auto-task marker returned by ${source}`)
	}
	return { ...value }
}

/**
 * Creates a distributed marker store backed by an injected Redis-compatible client.
 *
 * Marker generations are incremented atomically in Redis. The adapter does not create, connect,
 * or close the client.
 *
 * @param client - Connected Redis-compatible client.
 * @param options - Optional key prefix.
 * @returns A Redis-backed marker store.
 */
export function createRedisAutoTaskMarkerStore(
	client: RedisAutoTaskMarkerClient,
	options: RedisAutoTaskMarkerStoreOptions = {},
): AutoTaskMarkerStore {
	const keyPrefix = options.keyPrefix ?? 'extension-utils:auto-task:'
	const keysFor = (identifier: string): [string, string] => {
		const key = `${keyPrefix}${encodeURIComponent(identifier)}`
		return [`${key}:generation`, `${key}:marker`]
	}

	return {
		touch: async (identifier, updatedAt) => {
			if (!Number.isFinite(updatedAt))
				throw new RangeError('Auto task marker time must be finite')
			const [generationKey, markerKey] = keysFor(identifier)
			const result = await client.eval(
				TOUCH_MARKER_SCRIPT,
				2,
				generationKey,
				markerKey,
				updatedAt,
			)
			return validateMarker({ generation: Number(result), updatedAt }, 'Redis touch result')
		},
		get: async (identifier) => {
			const [, markerKey] = keysFor(identifier)
			const value = await client.get(markerKey)
			if (value === null) return undefined
			const separator = value.indexOf(':')
			const marker = {
				generation: Number(value.slice(0, separator)),
				updatedAt: Number(value.slice(separator + 1)),
			}
			return validateMarker(marker, 'Redis marker value')
		},
		clear: async (identifier, generation) => {
			const [generationKey, markerKey] = keysFor(identifier)
			const result = await client.eval(
				CLEAR_MARKER_SCRIPT,
				2,
				generationKey,
				markerKey,
				generation,
			)
			return Number(result) === 1
		},
	}
}

/** Timer boundary used to make scheduling deterministic in tests and specialized runtimes. */
export interface AutoTaskScheduler {
	setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
	clearTimeout(handle: ReturnType<typeof setTimeout>): void
	setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>
	clearInterval(handle: ReturnType<typeof setInterval>): void
}

const defaultScheduler: AutoTaskScheduler = {
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: (handle) => clearTimeout(handle),
	setInterval: (callback, delayMs) => setInterval(callback, delayMs),
	clearInterval: (handle) => clearInterval(handle),
}

/** Configuration for a debounced, lock-protected task handler. */
export interface AutoTaskHandlerOptions {
	/** Unique marker identifier, such as `schema-snapshot`. */
	debounceId: string
	/** Work to execute after the debounce window. */
	task: () => Promise<void> | void
	/** Lock provider used to exclude concurrent task executions. */
	lockProvider: LockProvider
	/** Optional logger for lifecycle messages. */
	logger?: LoggerLike
	/** Debounce window in milliseconds. Defaults to 15 seconds. */
	debounceMs?: number
	/** Maximum lifetime of a debounce marker. Defaults to 5 minutes. */
	markerLeaseMs?: number
	/** Lease duration for the execution lock. Defaults to 5 minutes. */
	taskLeaseMs?: number
	/** Delay before retrying after lock contention. Defaults to `debounceMs`. */
	retryMs?: number
	/** Renewal interval. Defaults to half of `taskLeaseMs`. */
	renewalIntervalMs?: number
	/** Clock returning milliseconds since epoch. */
	now?: () => number
	/** Shared marker store. Defaults to a process-local store. */
	markerStore?: AutoTaskMarkerStore
	/** Scheduler boundary. */
	scheduler?: AutoTaskScheduler
	/** Receives task, lock, marker, and renewal failures. */
	onError?: (error: unknown) => void | Promise<void>
	/** Lock name. Defaults to `BULK_OPERATION_LOCK` for Tio compatibility. */
	lockName?: string
}

/** A trigger function with an explicit timer cleanup operation. */
export interface AutoTaskHandler {
	/** Records a trigger and schedules the latest generation. */
	(): Promise<void>
	/** Cancels pending timers; an already-running task is allowed to finish. */
	dispose(): void
}

const validateDuration = (name: string, value: number): number => {
	if (!Number.isFinite(value) || value < 0) {
		throw new RangeError(`${name} must be a finite non-negative number`)
	}
	return value
}

const reportError = async (
	error: unknown,
	logger: ReturnType<typeof createLogger>,
	onError: ((error: unknown) => void | Promise<void>) | undefined,
): Promise<void> => {
	logger.error('Auto task failed', {
		cause: error instanceof Error ? error.message : String(error),
	})
	if (onError) await onError(error)
}

/**
 * Creates a debounced task handler coordinated by an injected owner-bound lock provider.
 *
 * Each trigger creates a marker generation. Only the latest generation may execute. Contention
 * leaves the generation pending and retries after `retryMs`; task locks are renewed while work is
 * running. The default marker store is process-local, so distributed debounce state requires an
 * injected shared marker store in addition to a distributed lock provider.
 *
 * @param options - Handler behavior and runtime boundaries.
 * @returns A trigger function with timer disposal.
 */
export function createAutoTaskHandler(options: AutoTaskHandlerOptions): AutoTaskHandler {
	if (options.debounceId.trim().length === 0) {
		throw new TypeError('Auto task debounceId must not be empty')
	}
	const debounceMs = validateDuration('Auto task debounceMs', options.debounceMs ?? 15_000)
	const markerLeaseMs = validateDuration(
		'Auto task markerLeaseMs',
		options.markerLeaseMs ?? 5 * 60 * 1000,
	)
	const taskLeaseMs = options.taskLeaseMs ?? 5 * 60 * 1000
	if (!Number.isFinite(taskLeaseMs) || taskLeaseMs <= 0) {
		throw new RangeError('Auto task taskLeaseMs must be a finite positive number')
	}
	const retryMs = validateDuration('Auto task retryMs', options.retryMs ?? debounceMs)
	const renewalIntervalMs = options.renewalIntervalMs ?? taskLeaseMs / 2
	if (!Number.isFinite(renewalIntervalMs) || renewalIntervalMs <= 0) {
		throw new RangeError('Auto task renewalIntervalMs must be a finite positive number')
	}

	const logger = createLogger(options.logger)
	const markerStore = options.markerStore ?? createMemoryAutoTaskMarkerStore()
	const scheduler = options.scheduler ?? defaultScheduler
	const now = options.now ?? Date.now
	const lockName = options.lockName ?? BULK_OPERATION_LOCK
	let timer: ReturnType<typeof setTimeout> | undefined
	let disposed = false

	const schedule = (generation: number, delayMs: number): void => {
		if (disposed) return
		if (timer !== undefined) scheduler.clearTimeout(timer)
		timer = scheduler.setTimeout(() => {
			timer = undefined
			void run(generation)
		}, delayMs)
	}

	const run = async (expectedGeneration: number): Promise<void> => {
		if (disposed) return
		try {
			const marker = await markerStore.get(options.debounceId)
			if (!marker || marker.generation !== expectedGeneration) return
			const elapsed = now() - marker.updatedAt
			if (elapsed < debounceMs) {
				schedule(expectedGeneration, debounceMs - elapsed)
				return
			}
			if (elapsed > markerLeaseMs) {
				await markerStore.clear(options.debounceId, expectedGeneration)
				return
			}

			const lease = await options.lockProvider.tryAcquire(lockName, { leaseMs: taskLeaseMs })
			if (!lease) {
				schedule(expectedGeneration, retryMs)
				return
			}

			let renewalTimer: ReturnType<typeof setInterval> | undefined
			let leaseLost = false
			const renew = async (): Promise<void> => {
				try {
					if (!(await lease.renew())) {
						leaseLost = true
						if (renewalTimer !== undefined) scheduler.clearInterval(renewalTimer)
					}
				} catch (error) {
					leaseLost = true
					if (renewalTimer !== undefined) scheduler.clearInterval(renewalTimer)
					await reportError(error, logger, options.onError)
				}
			}
			renewalTimer = scheduler.setInterval(() => {
				void renew()
			}, renewalIntervalMs)

			try {
				logger.info(`Running auto task: ${options.debounceId}`)
				await options.task()
				if (leaseLost) {
					await reportError(
						new Error('Auto task lock lease was lost'),
						logger,
						options.onError,
					)
				} else {
					logger.info(`Completed auto task: ${options.debounceId}`)
				}
			} catch (error) {
				await reportError(error, logger, options.onError)
			} finally {
				if (renewalTimer !== undefined) scheduler.clearInterval(renewalTimer)
				try {
					await lease.release()
				} catch (error) {
					await reportError(error, logger, options.onError)
				}
				try {
					await markerStore.clear(options.debounceId, expectedGeneration)
				} catch (error) {
					await reportError(error, logger, options.onError)
				}
			}
		} catch (error) {
			await reportError(error, logger, options.onError)
		}
	}

	const trigger = async (): Promise<void> => {
		if (disposed) return
		try {
			const marker = await markerStore.touch(options.debounceId, now())
			logger.info(`Auto task scheduled: ${options.debounceId}`)
			schedule(marker.generation, debounceMs)
		} catch (error) {
			await reportError(error, logger, options.onError)
		}
	}

	trigger.dispose = (): void => {
		disposed = true
		if (timer !== undefined) scheduler.clearTimeout(timer)
	}

	return trigger
}
