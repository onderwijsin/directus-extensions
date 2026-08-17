import { afterEach, describe, expect, it, vi } from 'vitest'

import {
	createAutoTaskHandler,
	createMemoryMarkerStore,
	createMemoryTaskHandlerStorage,
	createMemoryLockProvider,
	type AutoTaskMarkerStore,
	type LockLease,
	type LockProvider,
	type TaskHandlerStorage,
} from '../src/server'

const createTestStorage = (
	lockProvider: LockProvider,
	markerStore: AutoTaskMarkerStore = createMemoryMarkerStore(),
): TaskHandlerStorage => ({
	lockProvider,
	markerStore,
	dispose: () => Promise.resolve(),
})

const logger = {
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	trace: vi.fn(),
}

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('createAutoTaskHandler', () => {
	it('debounces multiple triggers to the latest generation', async () => {
		vi.useFakeTimers()
		const task = vi.fn()
		const handler = createAutoTaskHandler({
			taskId: 'items',
			task,
			storage: createMemoryTaskHandlerStorage(),
			debounceMs: 100,
			logger,
		})

		await Promise.all([handler(), handler(), handler()])
		await vi.advanceTimersByTimeAsync(99)
		expect(task).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)

		expect(task).toHaveBeenCalledOnce()
		expect(logger.info).toHaveBeenNthCalledWith(1, '📅 Auto task scheduled: items')
		expect(logger.info).toHaveBeenNthCalledWith(2, '📅 Auto task scheduled: items')
		expect(logger.info).toHaveBeenNthCalledWith(3, '📅 Auto task scheduled: items')
		expect(logger.info).toHaveBeenNthCalledWith(4, '▶️ Running auto task: items')
		expect(logger.info).toHaveBeenNthCalledWith(5, '✅ Completed auto task: items')
		handler.dispose()
	})

	it('keeps only the newest generation after a trigger burst', async () => {
		const markerStore = createMemoryMarkerStore()
		await Promise.all(
			Array.from({ length: 5 }, (_, index) => markerStore.touch('items', index)),
		)

		expect(await markerStore.get('items')).toEqual({ generation: 5, updatedAt: 4 })
	})

	it('rejects invalid timestamps in the memory marker store', async () => {
		const markerStore = createMemoryMarkerStore()

		await expect(markerStore.touch('items', Number.NaN)).rejects.toThrow(
			'Auto task marker time must be finite',
		)
		await expect(markerStore.touch('items', Number.POSITIVE_INFINITY)).rejects.toThrow(
			'Auto task marker time must be finite',
		)
	})

	it('keeps the marker when the task fails', async () => {
		vi.useFakeTimers()
		const clear = vi.fn().mockResolvedValue(true)
		const markerStore: AutoTaskMarkerStore = {
			touch: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			get: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			clear,
		}
		const handler = createAutoTaskHandler({
			taskId: 'failed-task',
			task: () => {
				throw new Error('task failed')
			},
			storage: createTestStorage(createMemoryLockProvider(), markerStore),
			debounceMs: 10,
			now: () => 0,
			logger,
		})

		await handler()
		await vi.advanceTimersByTimeAsync(10)

		expect(clear).not.toHaveBeenCalled()
		handler.dispose()
	})

	it('retries a generation after lock contention', async () => {
		vi.useFakeTimers()
		const lockProvider = createMemoryLockProvider()
		const blocker = await lockProvider.tryAcquire('items', { leaseMs: 1000 })
		const task = vi.fn()
		const handler = createAutoTaskHandler({
			taskId: 'items',
			task,
			storage: createTestStorage(lockProvider),
			debounceMs: 100,
			retryMs: 25,
			logger,
		})

		await handler()
		await vi.advanceTimersByTimeAsync(100)
		expect(task).not.toHaveBeenCalled()
		await blocker?.release()
		await vi.advanceTimersByTimeAsync(24)
		expect(task).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		expect(task).toHaveBeenCalledOnce()
		handler.dispose()
	})

	it('runs one shared generation when handlers contend after observing it', async () => {
		vi.useFakeTimers()
		let markerPresent = true
		const markerStore: AutoTaskMarkerStore = {
			touch: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			get: vi
				.fn()
				.mockImplementation(() =>
					markerPresent ? { generation: 1, updatedAt: 0 } : undefined,
				),
			clear: vi.fn().mockImplementation(() => {
				markerPresent = false
				return true
			}),
		}
		const lockProvider = createMemoryLockProvider()
		const task = vi.fn()
		const first = createAutoTaskHandler({
			taskId: 'shared',
			task,
			storage: createTestStorage(lockProvider, markerStore),
			debounceMs: 10,
			now: () => 10,
			logger,
		})
		const second = createAutoTaskHandler({
			taskId: 'shared',
			task,
			storage: createTestStorage(lockProvider, markerStore),
			debounceMs: 10,
			now: () => 10,
			logger,
		})

		await Promise.all([first(), second()])
		await vi.advanceTimersByTimeAsync(10)

		expect(task).toHaveBeenCalledOnce()
		first.dispose()
		second.dispose()
	})

	it('renews the task lease while work is running', async () => {
		vi.useFakeTimers()
		let finishTask!: () => void
		const task = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishTask = resolve
				}),
		)
		const renew = vi.fn().mockResolvedValue(true)
		const release = vi.fn().mockResolvedValue(true)
		const lease: LockLease = {
			name: 'bulk-operation',
			token: 'token',
			renew,
			release,
		}
		const lockProvider: LockProvider = {
			tryAcquire: vi.fn().mockResolvedValue(lease),
		}
		const handler = createAutoTaskHandler({
			taskId: 'items',
			task,
			storage: createTestStorage(lockProvider),
			debounceMs: 10,
			taskLeaseMs: 100,
			renewalIntervalMs: 50,
			logger,
		})

		await handler()
		await vi.advanceTimersByTimeAsync(10)
		await vi.advanceTimersByTimeAsync(100)
		expect(renew).toHaveBeenCalledTimes(2)
		finishTask()
		await vi.runOnlyPendingTimersAsync()
		expect(release).toHaveBeenCalledOnce()
		handler.dispose()
	})

	it('aborts work and keeps the marker when the lease is lost', async () => {
		vi.useFakeTimers()
		let currentTime = 0
		let finishTask!: () => void
		let taskSignal!: AbortSignal
		const clear = vi.fn().mockResolvedValue(true)
		const markerStore: AutoTaskMarkerStore = {
			touch: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			get: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			clear,
		}
		const handler = createAutoTaskHandler({
			taskId: 'lease-loss',
			task: (signal) => {
				taskSignal = signal
				return new Promise<void>((resolve) => {
					finishTask = resolve
				})
			},
			storage: createTestStorage(
				{
					tryAcquire: vi.fn().mockResolvedValue({
						name: 'bulk-operation',
						token: 'token',
						renew: vi.fn().mockResolvedValue(false),
						release: vi.fn().mockResolvedValue(false),
					}),
				},
				markerStore,
			),
			debounceMs: 10,
			taskLeaseMs: 100,
			renewalIntervalMs: 20,
			now: () => currentTime,
			logger,
		})

		await handler()
		currentTime = 10
		await vi.advanceTimersByTimeAsync(10)
		await vi.advanceTimersByTimeAsync(20)
		expect(taskSignal.aborted).toBe(true)
		finishTask()
		await vi.runOnlyPendingTimersAsync()
		expect(clear).not.toHaveBeenCalled()
		handler.dispose()
	})

	it('reports task and release failures without rejecting the trigger', async () => {
		vi.useFakeTimers()
		const taskFailure = new Error('task failed')
		const releaseFailure = new Error('release failed')
		const onError = vi.fn()
		const lease: LockLease = {
			name: 'bulk-operation',
			token: 'token',
			renew: vi.fn().mockResolvedValue(true),
			release: vi.fn().mockRejectedValue(releaseFailure),
		}
		const handler = createAutoTaskHandler({
			taskId: 'items',
			task: () => {
				throw taskFailure
			},
			storage: createTestStorage({ tryAcquire: vi.fn().mockResolvedValue(lease) }),
			debounceMs: 10,
			logger,
			onError,
		})

		await expect(handler()).resolves.toBeUndefined()
		await vi.advanceTimersByTimeAsync(10)
		expect(onError).toHaveBeenCalledWith(taskFailure)
		expect(logger.error).toHaveBeenCalledWith('❌ Auto task failed', {
			cause: 'task failed',
		})
		expect(onError).toHaveBeenCalledWith(releaseFailure)
		handler.dispose()
	})

	it('reports lock acquisition, renewal, and marker failures', async () => {
		vi.useFakeTimers()
		const lockFailure = new Error('lock unavailable')
		const onError = vi.fn()
		const markerFailure: AutoTaskMarkerStore = {
			touch: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			get: vi.fn().mockRejectedValueOnce(new Error('marker read failed')),
			clear: vi.fn().mockRejectedValue(new Error('marker clear failed')),
		}
		const tryAcquire = vi.fn().mockRejectedValue(lockFailure)
		const lockProvider: LockProvider = {
			tryAcquire,
		}
		const handler = createAutoTaskHandler({
			taskId: 'items',
			task: vi.fn(),
			storage: createTestStorage(lockProvider, markerFailure),
			debounceMs: 10,
			logger,
			onError,
		})

		await handler()
		await vi.advanceTimersByTimeAsync(10)
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'marker read failed' }),
		)
		expect(tryAcquire).not.toHaveBeenCalled()
		handler.dispose()

		const renewFailure = new Error('renew unavailable')
		let finishRenew!: () => void
		const lease: LockLease = {
			name: 'bulk-operation',
			token: 'token',
			renew: vi.fn().mockRejectedValue(renewFailure),
			release: vi.fn().mockResolvedValue(true),
		}
		const renewalHandler = createAutoTaskHandler({
			taskId: 'renewal',
			task: () =>
				new Promise<void>((resolve) => {
					finishRenew = resolve
				}),
			storage: createTestStorage({ tryAcquire: vi.fn().mockResolvedValue(lease) }),
			debounceMs: 10,
			taskLeaseMs: 100,
			renewalIntervalMs: 20,
			logger,
			onError,
		})
		await renewalHandler()
		await vi.advanceTimersByTimeAsync(30)
		expect(onError).toHaveBeenCalledWith(renewFailure)
		finishRenew()
		await vi.runOnlyPendingTimersAsync()
		renewalHandler.dispose()

		const clearFailure = new Error('marker clear failed')
		const clearStore: AutoTaskMarkerStore = {
			touch: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			get: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			clear: vi.fn().mockRejectedValue(clearFailure),
		}
		const clearHandler = createAutoTaskHandler({
			taskId: 'clear',
			task: vi.fn(),
			storage: createTestStorage(createMemoryLockProvider(), clearStore),
			debounceMs: 10,
			logger,
			onError,
		})
		await clearHandler()
		await vi.advanceTimersByTimeAsync(10)
		expect(onError).toHaveBeenCalledWith(clearFailure)
		clearHandler.dispose()
	})

	it('does not run stale markers and supports newer triggers during a task', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(100)
		const clear = vi.fn().mockResolvedValue(true)
		const staleStore: AutoTaskMarkerStore = {
			touch: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			get: vi.fn().mockResolvedValue({ generation: 1, updatedAt: 0 }),
			clear,
		}
		const staleTask = vi.fn()
		const staleHandler = createAutoTaskHandler({
			taskId: 'stale',
			task: staleTask,
			storage: createTestStorage(createMemoryLockProvider(), staleStore),
			debounceMs: 10,
			markerLeaseMs: 20,
			logger,
		})
		await staleHandler()
		await vi.advanceTimersByTimeAsync(10)
		expect(staleTask).not.toHaveBeenCalled()
		expect(clear).toHaveBeenCalledWith('stale', 1)
		staleHandler.dispose()

		let finishTask!: () => void
		let calls = 0
		const task = vi.fn(() => {
			calls += 1
			if (calls === 1)
				return new Promise<void>((resolve) => {
					finishTask = resolve
				})
			return Promise.resolve()
		})
		const handler = createAutoTaskHandler({
			taskId: 'items',
			task,
			storage: createMemoryTaskHandlerStorage(),
			debounceMs: 10,
			markerLeaseMs: 100,
			logger,
		})

		await handler()
		await vi.advanceTimersByTimeAsync(10)
		expect(task).toHaveBeenCalledOnce()
		await handler()
		finishTask()
		await vi.advanceTimersByTimeAsync(10)
		expect(task).toHaveBeenCalledTimes(2)
		handler.dispose()
	})

	it('validates configuration and disposes pending work', async () => {
		const lockProvider = createMemoryLockProvider()
		for (const options of [
			{ taskId: ' ', debounceMs: 1 },
			{ taskId: 'id', debounceMs: -1 },
			{ taskId: 'id', markerLeaseMs: -1 },
			{ taskId: 'id', taskLeaseMs: 0 },
			{ taskId: 'id', retryMs: -1 },
			{ taskId: 'id', renewalIntervalMs: 0 },
		]) {
			expect(() =>
				createAutoTaskHandler({
					...options,
					task: vi.fn(),
					storage: createTestStorage(lockProvider),
				}),
			).toThrow()
		}

		vi.useFakeTimers()
		const task = vi.fn()
		const handler = createAutoTaskHandler({
			taskId: 'disposed',
			task,
			storage: createTestStorage(lockProvider),
			debounceMs: 10,
			logger,
		})
		await handler()
		handler.dispose()
		await vi.advanceTimersByTimeAsync(100)
		expect(task).not.toHaveBeenCalled()
	})

	it('does not reject when the error handler throws', async () => {
		vi.useFakeTimers()
		const handler = createAutoTaskHandler({
			taskId: 'error-handler',
			task: () => {
				throw new Error('task failed')
			},
			storage: createMemoryTaskHandlerStorage(),
			debounceMs: 10,
			logger,
			onError: () => {
				throw new Error('reporting failed')
			},
		})

		await expect(handler()).resolves.toBeUndefined()
		await vi.advanceTimersByTimeAsync(10)
		handler.dispose()
	})
})
