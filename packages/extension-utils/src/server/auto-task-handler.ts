import type { TaskHandlerStorage } from './task-storage-memory'

import { BULK_OPERATION_LOCK } from './lock-core'
import { createLogger, type LoggerLike } from './logger'

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
		touch: async (identifier, updatedAt) => {
			const marker = {
				generation: (markers.get(identifier)?.generation ?? 0) + 1,
				updatedAt,
			}
			markers.set(identifier, marker)
			return marker
		},
		get: async (identifier) => markers.get(identifier),
		clear: async (identifier, generation) => {
			if (markers.get(identifier)?.generation !== generation) return false
			markers.delete(identifier)
			return true
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

/** Validates a non-negative timer duration.
 * @param name - Option name for diagnostics.
 * @param value - Duration to validate.
 * @returns The validated duration.
 */
const validateDuration = (name: string, value: number): number => {
	if (!Number.isFinite(value) || value < 0) {
		throw new RangeError(`${name} must be a finite non-negative number`)
	}
	return value
}

/** Reports a task failure without allowing the error callback to reject the handler.
 * @param error - Failure to report.
 * @param logger - Logger adapter.
 * @param onError - Optional consumer error callback.
 * @returns A promise that resolves after reporting.
 */
const reportError = async (
	error: unknown,
	logger: ReturnType<typeof createLogger>,
	onError: ((error: unknown) => void | Promise<void>) | undefined,
): Promise<void> => {
	logger.error('Auto task failed', {
		cause: error instanceof Error ? error.message : String(error),
	})
	if (!onError) return
	try {
		await onError(error)
	} catch (handlerError) {
		logger.error('Auto task error handler failed', {
			cause: handlerError instanceof Error ? handlerError.message : String(handlerError),
		})
	}
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
	const { lockProvider, markerStore } = options.storage
	const scheduler = options.scheduler ?? defaultScheduler
	const now = options.now ?? Date.now
	const lockName = options.lockName ?? BULK_OPERATION_LOCK
	let timer: ReturnType<typeof setTimeout> | undefined
	let disposed = false

	/** Replaces the pending timer with one for the newest known generation.
	 * @param generation - Generation the timer should execute.
	 * @param delayMs - Delay before execution.
	 * @returns Nothing.
	 */
	const schedule = (generation: number, delayMs: number): void => {
		if (disposed) return
		if (timer !== undefined) scheduler.clearTimeout(timer)
		timer = scheduler.setTimeout(() => {
			timer = undefined
			void run(generation)
		}, delayMs)
	}

	/** Reads, claims, runs, and finalizes one debounce generation.
	 * @param expectedGeneration - Generation this timer observed.
	 * @returns A promise that resolves after orchestration.
	 */
	const run = async (expectedGeneration: number): Promise<void> => {
		if (disposed) return
		try {
			// Re-read shared state before doing work: a newer trigger makes this timer obsolete.
			const marker = await markerStore.get(options.debounceId)
			if (!marker || marker.generation !== expectedGeneration) return
			const elapsed = now() - marker.updatedAt
			if (elapsed < debounceMs) {
				schedule(expectedGeneration, debounceMs - elapsed)
				return
			}
			if (elapsed > markerLeaseMs) {
				// Expired work is discarded only for the generation observed by this run.
				await markerStore.clear(options.debounceId, expectedGeneration)
				return
			}

			const lease = await lockProvider.tryAcquire(lockName, { leaseMs: taskLeaseMs })
			if (!lease) {
				// Keep the marker pending; another owner may release the lock before retry.
				schedule(expectedGeneration, retryMs)
				return
			}

			let renewalTimer: ReturnType<typeof setInterval> | undefined
			let leaseLost = false
			const taskController = new AbortController()
			/** Renews the lease and aborts work when this owner no longer holds it.
			 * @returns A promise that resolves after the renewal attempt.
			 */
			const renew = async (): Promise<void> => {
				try {
					if (!(await lease.renew())) {
						leaseLost = true
						taskController.abort(new Error('Auto task lock lease was lost'))
						if (renewalTimer !== undefined) scheduler.clearInterval(renewalTimer)
					}
				} catch (error) {
					leaseLost = true
					taskController.abort(error)
					if (renewalTimer !== undefined) scheduler.clearInterval(renewalTimer)
					await reportError(error, logger, options.onError)
				}
			}
			renewalTimer = scheduler.setInterval(() => {
				void renew()
			}, renewalIntervalMs)

			try {
				logger.info(`Running auto task: ${options.debounceId}`)
				await options.task(taskController.signal)
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
				// Stop renewal before releasing the lease so finalization cannot race renewal.
				if (renewalTimer !== undefined) scheduler.clearInterval(renewalTimer)
				try {
					await lease.release()
				} catch (error) {
					await reportError(error, logger, options.onError)
				}
				if (!leaseLost) {
					// A lost owner must not acknowledge work another owner may need to retry.
					try {
						await markerStore.clear(options.debounceId, expectedGeneration)
					} catch (error) {
						await reportError(error, logger, options.onError)
					}
				}
			}
		} catch (error) {
			await reportError(error, logger, options.onError)
		}
	}

	/** Records a trigger and starts or replaces the debounce timer.
	 * @returns A promise that resolves after recording the trigger.
	 */
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
