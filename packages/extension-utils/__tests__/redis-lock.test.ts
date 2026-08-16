import Redis from 'ioredis'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	acquireLock: vi.fn(),
	createKv: vi.fn(),
	quit: vi.fn(),
}))

vi.mock('@directus/memory', () => ({ createKv: mocks.createKv }))
vi.mock('ioredis', () => ({
	default: class RedisMock {
		public constructor(public readonly url: string) {}
		public quit = mocks.quit
	},
}))

import { createRedisLockProvider } from '../src/server/lock'

describe('createRedisLockProvider', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('initializes Directus KV with the Redis URL and lock options', async () => {
		const lock = {
			extend: vi.fn().mockResolvedValue(undefined),
			release: vi.fn().mockResolvedValue(undefined),
		}
		mocks.createKv.mockReturnValue({ acquireLock: mocks.acquireLock })
		mocks.acquireLock.mockResolvedValue(lock)

		const provider = createRedisLockProvider({
			redisUrl: 'redis://localhost:6379',
			namespace: 'test:locks',
			lockTimeoutMs: 10_000,
		})
		const lease = await provider.tryAcquire('item', { leaseMs: 2_000 })

		expect(mocks.createKv).toHaveBeenCalledWith({
			type: 'redis',
			namespace: 'test:locks',
			redis: expect.anything(),
			lockTimeout: 2_000,
		})
		expect(lease?.name).toBe('item')
		expect(await lease?.renew()).toBe(true)
		expect(await lease?.release()).toBe(true)
		await provider.dispose()
		expect(mocks.quit).toHaveBeenCalledOnce()
	})

	it('uses the default namespace and timeout when options are omitted', async () => {
		mocks.createKv.mockReturnValue({ acquireLock: mocks.acquireLock })
		mocks.acquireLock.mockResolvedValue({
			extend: vi.fn().mockResolvedValue(undefined),
			release: vi.fn().mockResolvedValue(undefined),
		})

		const provider = createRedisLockProvider({ redisUrl: 'redis://localhost:6379' })
		await provider.tryAcquire('item')

		expect(mocks.createKv).toHaveBeenCalledWith(
			expect.objectContaining({
				namespace: 'directus:locks',
				lockTimeout: 30_000,
			}),
		)
	})

	it('validates connection and timeout options', () => {
		expect(() => createRedisLockProvider({ redisUrl: ' ' })).toThrow(
			'Redis URL must not be empty',
		)
		expect(() =>
			createRedisLockProvider({ redisUrl: 'redis://localhost', lockTimeoutMs: 0 }),
		).toThrow('Lock lockTimeoutMs must be a finite positive number')
	})

	it('maps contention errors to null and propagates other backend failures', async () => {
		const contention = Object.assign(new Error('busy'), { name: 'ExecutionError' })
		mocks.createKv.mockReturnValueOnce({ acquireLock: vi.fn().mockRejectedValue(contention) })
		const provider = createRedisLockProvider({ redisUrl: 'redis://localhost' })
		expect(await provider.tryAcquire('item')).toBeNull()
		await provider.dispose()

		const backendFailure = new Error('redis unavailable')
		mocks.createKv.mockReturnValueOnce({
			acquireLock: vi.fn().mockRejectedValue(backendFailure),
		})
		const failingProvider = createRedisLockProvider({ redisUrl: 'redis://localhost' })
		await expect(failingProvider.tryAcquire('item')).rejects.toBe(backendFailure)
		await failingProvider.dispose()
	})

	it('propagates renewal and release failures and rejects use after disposal', async () => {
		const renewFailure = new Error('extend failed')
		const releaseFailure = new Error('release failed')
		const lock = {
			extend: vi.fn().mockRejectedValue(renewFailure),
			release: vi.fn().mockRejectedValue(releaseFailure),
		}
		mocks.createKv.mockReturnValue({ acquireLock: vi.fn().mockResolvedValue(lock) })
		const provider = createRedisLockProvider({ redisUrl: 'redis://localhost' })
		const lease = await provider.tryAcquire('item')
		await expect(lease?.renew()).rejects.toBe(renewFailure)
		await expect(lease?.release()).rejects.toBe(releaseFailure)
		await provider.dispose()
		await expect(provider.tryAcquire('item')).rejects.toThrow(
			'Redis lock provider has been disposed',
		)
	})

	it('does not close a Redis connection owned by a higher-level storage provider', async () => {
		const redis = new Redis('redis://localhost')
		const provider = createRedisLockProvider({
			redisUrl: 'redis://localhost',
			redis,
		})
		await provider.dispose()
		expect(mocks.quit).not.toHaveBeenCalled()
	})
})
