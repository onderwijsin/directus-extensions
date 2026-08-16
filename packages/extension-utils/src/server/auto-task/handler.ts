import type { LockLease } from '../lock/lock-core'
import type { AutoTaskHandler, AutoTaskHandlerOptions, AutoTaskScheduler } from './auto-task-core'

import { attempt } from '../../shared/attempt'
import { isFiniteNumber, isFunction, isNonBlankString } from '../../shared/guards'
import { createLogger } from '../logger'

const defaultScheduler: AutoTaskScheduler = {
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: (handle) => clearTimeout(handle),
	setInterval: (callback, delayMs) => setInterval(callback, delayMs),
	clearInterval: (handle) => clearInterval(handle),
}

interface HandlerConfig {
	taskId: string
	debounceMs: number
	markerLeaseMs: number
	taskLeaseMs: number
	retryMs: number
	renewalIntervalMs: number
	now: () => number
	scheduler: AutoTaskScheduler
}

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

	const schedule = (generation: number, delayMs: number): void => {
		if (disposed) return
		if (timer !== undefined) config.scheduler.clearTimeout(timer)
		timer = config.scheduler.setTimeout(() => {
			timer = undefined
			void run(generation)
		}, delayMs)
	}

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

	const finish = async (
		lease: LockLease,
		generation: number,
		leaseLost: boolean,
	): Promise<void> => {
		if (!leaseLost) {
			try {
				await markerStore.clear(config.taskId, generation)
			} catch (error) {
				await reportError(error, logger, options.onError)
			}
		}
		try {
			await lease.release()
		} catch (error) {
			await reportError(error, logger, options.onError)
		}
	}

	const execute = async (lease: LockLease, generation: number): Promise<void> => {
		const controller = new AbortController()
		let leaseLost = false
		let renewalTimer: ReturnType<typeof setInterval> | undefined
		const renew = async (): Promise<void> => {
			try {
				if (await lease.renew()) return
				leaseLost = true
				controller.abort(new Error('Auto task lock lease was lost'))
			} catch (error) {
				leaseLost = true
				controller.abort(error)
				await reportError(error, logger, options.onError)
			} finally {
				if (leaseLost && renewalTimer !== undefined) {
					config.scheduler.clearInterval(renewalTimer)
				}
			}
		}
		renewalTimer = config.scheduler.setInterval(() => void renew(), config.renewalIntervalMs)

		logger.info(`Running auto task: ${config.taskId}`)
		const result = await attempt(() => options.task(controller.signal))
		if (result.error !== null) {
			await reportError(result.error, logger, options.onError)
		} else if (leaseLost) {
			await reportError(new Error('Auto task lock lease was lost'), logger, options.onError)
		} else {
			logger.info(`Completed auto task: ${config.taskId}`)
		}
		if (renewalTimer !== undefined) config.scheduler.clearInterval(renewalTimer)
		await finish(lease, generation, leaseLost)
	}

	const run = async (generation: number): Promise<void> => {
		if (disposed) return
		try {
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
		} catch (error) {
			await reportError(error, logger, options.onError)
		}
	}

	const trigger = async (): Promise<void> => {
		if (disposed) return
		try {
			const marker = await markerStore.touch(config.taskId, config.now())
			logger.info(`Auto task scheduled: ${config.taskId}`)
			schedule(marker.generation, config.debounceMs)
		} catch (error) {
			await reportError(error, logger, options.onError)
		}
	}

	trigger.dispose = (): void => {
		disposed = true
		if (timer !== undefined) config.scheduler.clearTimeout(timer)
	}

	return trigger
}
