import { afterEach, describe, expect, it, vi } from 'vitest'

import {
	createAutoTaskHandler,
	createMemoryAutoTaskMarkerStore,
	createMemoryTaskHandlerStorage,
	createMemoryLockProvider,
	type AutoTaskMarkerStore,
	type LockLease,
	type LockProvider,
	type TaskHandlerStorage,
} from '../src/index'

const createTestStorage = (
	lockProvider: LockProvider,
	markerStore: AutoTaskMarkerStore = createMemoryAutoTaskMarkerStore(),
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
			debounceId: 'items',
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
		handler.dispose()
	})

	it('retries a generation after lock contention', async () => {
		vi.useFakeTimers()
		const lockProvider = createMemoryLockProvider()
		const blocker = await lockProvider.tryAcquire('bulk-operation', { leaseMs: 1000 })
		const task = vi.fn()
		const handler = createAutoTaskHandler({
			debounceId: 'items',
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
			debounceId: 'items',
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
			debounceId: 'lease-loss',
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
			debounceId: 'items',
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
			debounceId: 'items',
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
			debounceId: 'renewal',
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
			debounceId: 'clear',
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
			debounceId: 'stale',
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
			debounceId: 'items',
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
			{ debounceId: ' ', debounceMs: 1 },
			{ debounceId: 'id', debounceMs: -1 },
			{ debounceId: 'id', markerLeaseMs: -1 },
			{ debounceId: 'id', taskLeaseMs: 0 },
			{ debounceId: 'id', retryMs: -1 },
			{ debounceId: 'id', renewalIntervalMs: 0 },
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
			debounceId: 'disposed',
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
			debounceId: 'error-handler',
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
