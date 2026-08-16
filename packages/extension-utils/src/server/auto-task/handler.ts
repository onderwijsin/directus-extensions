import type { AutoTaskHandler, AutoTaskHandlerOptions, AutoTaskScheduler } from './auto-task-core'

import { createLogger } from '../logger'

const defaultScheduler: AutoTaskScheduler = {
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: (handle) => clearTimeout(handle),
	setInterval: (callback, delayMs) => setInterval(callback, delayMs),
	clearInterval: (handle) => clearInterval(handle),
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
	if (options.taskId.trim().length === 0) {
		throw new TypeError('Auto task taskId must not be empty')
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
			const marker = await markerStore.get(options.taskId)
			if (!marker || marker.generation !== expectedGeneration) return
			const elapsed = now() - marker.updatedAt
			if (elapsed < debounceMs) {
				schedule(expectedGeneration, debounceMs - elapsed)
				return
			}
			if (elapsed > markerLeaseMs) {
				// Expired work is discarded only for the generation observed by this run.
				await markerStore.clear(options.taskId, expectedGeneration)
				return
			}

			const lease = await lockProvider.tryAcquire(options.taskId, { leaseMs: taskLeaseMs })
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
				logger.info(`Running auto task: ${options.taskId}`)
				await options.task(taskController.signal)
				if (leaseLost) {
					await reportError(
						new Error('Auto task lock lease was lost'),
						logger,
						options.onError,
					)
				} else {
					logger.info(`Completed auto task: ${options.taskId}`)
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
						await markerStore.clear(options.taskId, expectedGeneration)
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
			const marker = await markerStore.touch(options.taskId, now())
			logger.info(`Auto task scheduled: ${options.taskId}`)
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
