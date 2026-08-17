import type { LockLease } from '../lock/lock-core'
import type { AutoTaskHandler, AutoTaskHandlerOptions, AutoTaskScheduler } from './auto-task-core'

import { attempt } from '../../shared/attempt'
import { isFiniteNumber, isFunction, isNonBlankString } from '../../shared/guards'
import { createLogger } from '../logger'

const defaultScheduler: AutoTaskScheduler = {
	/**
	 * Schedules one callback after a delay.
	 * @param callback - Callback to invoke.
	 * @param delayMs - Delay in milliseconds.
	 * @returns Timer handle.
	 */
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	/**
	 * Cancels one scheduled callback.
	 * @param handle - Timer handle to cancel.
	 * @returns Nothing.
	 */
	clearTimeout: (handle) => clearTimeout(handle),
	/**
	 * Schedules a recurring callback.
	 * @param callback - Callback to invoke.
	 * @param delayMs - Delay between invocations in milliseconds.
	 * @returns Timer handle.
	 */
	setInterval: (callback, delayMs) => setInterval(callback, delayMs),
	/**
	 * Cancels one recurring callback.
	 * @param handle - Interval handle to cancel.
	 * @returns Nothing.
	 */
	clearInterval: (handle) => clearInterval(handle),
}

/** Validated scheduling and coordination settings used by an auto-task handler. */
interface HandlerConfig {
	/** Stable marker and lock identifier for the task. */
	taskId: string
	/** Delay before an eligible generation may run. */
	debounceMs: number
	/** Maximum age of a pending marker generation. */
	markerLeaseMs: number
	/** Lifetime of the execution lock. */
	taskLeaseMs: number
	/** Delay before retrying after lock contention. */
	retryMs: number
	/** Interval between execution-lock renewal attempts. */
	renewalIntervalMs: number
	/** Clock used to calculate marker age. */
	now: () => number
	/** Timer implementation used by the handler. */
	scheduler: AutoTaskScheduler
}

/**
 * Validates one handler duration.
 * @param name - Configuration field name used in the validation error.
 * @param value - Duration in milliseconds to validate.
 * @param allowZero - Whether zero is a valid duration.
 * @returns The validated duration.
 */
const validateDuration = (name: string, value: number, allowZero = true): number => {
	if (!isFiniteNumber(value) || (allowZero ? value < 0 : value <= 0)) {
		throw new RangeError(
			`${name} must be a finite ${allowZero ? 'non-negative' : 'positive'} number`,
		)
	}
	return value
}

/**
 * Validates and normalizes handler configuration.
 * @param options - Handler options to validate.
 * @returns Validated handler configuration.
 */
const validateHandlerConfig = (options: AutoTaskHandlerOptions): HandlerConfig => {
	if (!isNonBlankString(options.taskId)) throw new TypeError('Auto task taskId must not be empty')
	const taskLeaseMs = validateDuration(
		'Auto task taskLeaseMs',
		options.taskLeaseMs ?? 5 * 60 * 1000,
		false,
	)
	if (options.now !== undefined && !isFunction(options.now)) {
		throw new TypeError('Auto task now must be a function')
	}
	return {
		taskId: options.taskId,
		debounceMs: validateDuration('Auto task debounceMs', options.debounceMs ?? 15_000),
		markerLeaseMs: validateDuration(
			'Auto task markerLeaseMs',
			options.markerLeaseMs ?? 5 * 60 * 1000,
		),
		taskLeaseMs,
		retryMs: validateDuration(
			'Auto task retryMs',
			options.retryMs ?? options.debounceMs ?? 15_000,
		),
		renewalIntervalMs: validateDuration(
			'Auto task renewalIntervalMs',
			options.renewalIntervalMs ?? taskLeaseMs / 2,
			false,
		),
		now: options.now ?? Date.now,
		scheduler: options.scheduler ?? defaultScheduler,
	}
}

/**
 * Reports a task failure without allowing the error callback to reject the handler.
 * @param error - Failure to report.
 * @param logger - Logger adapter.
 * @param onError - Optional consumer error callback.
 * @returns A promise that resolves after reporting.
 */
const reportError = async (
	error: unknown,
	logger: ReturnType<typeof createLogger>,
	onError: AutoTaskHandlerOptions['onError'],
): Promise<void> => {
	logger.error({
		msg: '❌ Auto task failed',
		cause: error instanceof Error ? error.message : String(error),
	})
	if (!onError) return
	const result = await attempt(() => onError(error))
	if (result.error !== null) {
		logger.error({
			msg: '❌ Auto task error handler failed',
			cause:
				result.error instanceof Error
					? result.error.message
					: (JSON.stringify(result.error) ?? 'Unknown error'),
		})
	}
}

/**
 * Creates a handler for debounced, lock-protected work.
 * @param options - Handler behavior and runtime boundaries.
 * @returns A trigger function with timer disposal.
 */
export function createAutoTaskHandler(options: AutoTaskHandlerOptions): AutoTaskHandler {
	const config = validateHandlerConfig(options)
	const logger = createLogger(options.logger)
	const { lockProvider, markerStore } = options.storage
	let timer: ReturnType<typeof setTimeout> | undefined
	let disposed = false

	/**
	 * Schedules a generation after the supplied delay, replacing an earlier timer.
	 * @param generation - Marker generation to run.
	 * @param delayMs - Delay before attempting execution.
	 * @returns Nothing.
	 */
	const schedule = (generation: number, delayMs: number): void => {
		if (disposed) return
		if (timer !== undefined) config.scheduler.clearTimeout(timer)
		timer = config.scheduler.setTimeout(() => {
			timer = undefined
			void run(generation)
		}, delayMs)
	}

	/**
	 * Checks that a marker generation is current and eligible to execute.
	 * @param generation - Marker generation to validate.
	 * @returns Whether the generation may acquire the execution lock.
	 */
	const prepareGeneration = async (generation: number): Promise<boolean> => {
		const marker = await markerStore.get(config.taskId)
		if (!marker || marker.generation !== generation) return false
		const elapsed = config.now() - marker.updatedAt
		if (elapsed < config.debounceMs) {
			schedule(generation, config.debounceMs - elapsed)
			return false
		}
		if (elapsed > config.markerLeaseMs) {
			await markerStore.clear(config.taskId, generation)
			return false
		}
		return true
	}

	/**
	 * Acknowledges a successful generation and releases its execution lease.
	 * @param lease - Execution lease held by this handler.
	 * @param generation - Marker generation associated with the execution.
	 * @param leaseLost - Whether renewal lost ownership during execution.
	 * @param taskSucceeded - Whether the task callback completed successfully.
	 * @returns A promise that resolves after cleanup and error reporting.
	 */
	const finish = async (
		lease: LockLease,
		generation: number,
		leaseLost: boolean,
		taskSucceeded: boolean,
	): Promise<void> => {
		if (!leaseLost && taskSucceeded) {
			const markerResult = await attempt(() => markerStore.clear(config.taskId, generation))
			if (markerResult.error !== null) {
				await reportError(markerResult.error, logger, options.onError)
			}
		}
		const releaseResult = await attempt(() => lease.release())
		if (releaseResult.error !== null) {
			await reportError(releaseResult.error, logger, options.onError)
		}
	}

	/**
	 * Runs one eligible task while renewing its execution lease.
	 * @param lease - Execution lease held by this handler.
	 * @param generation - Marker generation being executed.
	 * @returns A promise that resolves after task execution and cleanup.
	 */
	const execute = async (lease: LockLease, generation: number): Promise<void> => {
		const controller = new AbortController()
		let leaseLost = false
		let taskSucceeded = false
		let renewalTimer: ReturnType<typeof setInterval> | undefined
		/**
		 * Renews the execution lease and aborts the task when ownership is lost.
		 * @returns A promise that resolves after the renewal attempt is handled.
		 */
		const renew = async (): Promise<void> => {
			const result = await attempt(() => lease.renew())
			if (result.error !== null) {
				leaseLost = true
				controller.abort(result.error)
				await reportError(result.error, logger, options.onError)
			} else if (!result.data) {
				leaseLost = true
				controller.abort(new Error('Auto task lock lease was lost'))
			}
			if (leaseLost && renewalTimer !== undefined) {
				config.scheduler.clearInterval(renewalTimer)
			}
		}
		renewalTimer = config.scheduler.setInterval(() => void renew(), config.renewalIntervalMs)

		logger.info({ msg: `▶️ Running auto task: ${config.taskId}` })
		const result = await attempt(() => options.task(controller.signal))
		if (result.error !== null) {
			await reportError(result.error, logger, options.onError)
		} else if (leaseLost) {
			await reportError(new Error('Auto task lock lease was lost'), logger, options.onError)
		} else {
			taskSucceeded = true
			logger.info({ msg: `✅ Completed auto task: ${config.taskId}` })
		}
		if (renewalTimer !== undefined) config.scheduler.clearInterval(renewalTimer)
		await finish(lease, generation, leaseLost, taskSucceeded)
	}

	/**
	 * Prepares and executes one marker generation, retrying lock contention later.
	 * @param generation - Marker generation to process.
	 * @returns A promise that resolves after the generation attempt is handled.
	 */
	const run = async (generation: number): Promise<void> => {
		if (disposed) return
		const result = await attempt(async () => {
			if (!(await prepareGeneration(generation))) return
			const lease = await lockProvider.tryAcquire(config.taskId, {
				leaseMs: config.taskLeaseMs,
			})
			if (!lease) {
				schedule(generation, config.retryMs)
				return
			}
			if (!(await prepareGeneration(generation))) {
				await lease.release()
				return
			}
			await execute(lease, generation)
		})
		if (result.error !== null) {
			await reportError(result.error, logger, options.onError)
		}
	}

	/**
	 * Records a new marker generation and schedules its debounced execution.
	 * @returns A promise that resolves after the trigger is recorded or reported.
	 */
	const trigger = async (): Promise<void> => {
		if (disposed) return
		const result = await attempt(async () => {
			const marker = await markerStore.touch(config.taskId, config.now())
			logger.info({ msg: `📅 Auto task scheduled: ${config.taskId}` })
			schedule(marker.generation, config.debounceMs)
		})
		if (result.error !== null) {
			await reportError(result.error, logger, options.onError)
		}
	}

	/**
	 * Stops future triggers and cancels the pending timer.
	 * @returns Nothing.
	 */
	const dispose = (): void => {
		disposed = true
		if (timer !== undefined) config.scheduler.clearTimeout(timer)
	}
	trigger.dispose = dispose

	return trigger
}
