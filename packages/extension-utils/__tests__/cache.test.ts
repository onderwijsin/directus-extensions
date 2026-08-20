import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	createCache: vi.fn(),
}))

vi.mock('@directus/memory', () => ({ createCache: mocks.createCache }))
vi.mock('ioredis', () => ({
	default: class RedisMock {
		public constructor(public readonly url: string) {}
	},
}))

import { initializeCache, withCache } from '../src/server/cache'

describe('initializeCache', () => {
	afterEach(() => vi.clearAllMocks())

	it('returns null when caching is disabled', () => {
		expect(
			initializeCache({ CACHE_ENABLED: false, CACHE_STORE: 'memory' }, { ttl: 1000 }),
		).toBeNull()
		expect(mocks.createCache).not.toHaveBeenCalled()
	})

	it('creates a local cache with the configured TTL', () => {
		const cache = {}
		mocks.createCache.mockReturnValue(cache)

		expect(initializeCache({ CACHE_ENABLED: true, CACHE_STORE: 'memory' }, { ttl: 1000 })).toBe(
			cache,
		)
		expect(mocks.createCache).toHaveBeenCalledWith({ type: 'local', ttl: 1000 })
	})

	it('creates a Redis cache with the shared namespace and configured TTL', () => {
		const cache = {}
		mocks.createCache.mockReturnValue(cache)

		expect(
			initializeCache(
				{ CACHE_ENABLED: true, CACHE_STORE: 'redis', REDIS: 'redis://localhost' },
				{ ttl: 2000 },
			),
		).toBe(cache)
		expect(mocks.createCache).toHaveBeenCalledWith({
			type: 'redis',
			namespace: 'directus:extensions',
			redis: expect.anything(),
			ttl: 2000,
		})
	})

	it('requires a Redis URL for the Redis backend', () => {
		expect(() =>
			initializeCache({ CACHE_ENABLED: true, CACHE_STORE: 'redis' }, { ttl: 1000 }),
		).toThrow('Redis configuration is required when CACHE_STORE is redis')
	})

	it('rejects non-positive or non-finite TTL values', () => {
		for (const ttl of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() =>
				initializeCache({ CACHE_ENABLED: true, CACHE_STORE: 'memory' }, { ttl }),
			).toThrow('Cache ttl must be a finite positive number')
		}
	})
})

describe('withCache', () => {
	it('returns cached values and only invokes the handler after a miss', async () => {
		const cache = {
			get: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce('cached'),
			set: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn(),
			has: vi.fn(),
			clear: vi.fn(),
			acquireLock: vi.fn(),
			usingLock: vi.fn(),
		}
		const handler = vi.fn().mockResolvedValue('fresh')
		const read = withCache(
			{ cache, namespace: 'summary' },
			async (key: string, value: string) => `${key}:${value}:${await handler()}`,
		)

		expect(await read('key', 'value')).toBe('key:value:fresh')
		expect(await read('key', 'different-value')).toBe('cached')
		expect(handler).toHaveBeenCalledOnce()
		expect(cache.get).toHaveBeenNthCalledWith(1, 'summary:key')
		expect(cache.set).toHaveBeenCalledWith('summary:key', 'key:value:fresh')

		await read.clear('key')
		expect(cache.delete).toHaveBeenCalledWith('summary:key')
	})

	it('bypasses cache operations when no cache is configured', async () => {
		const handler = vi.fn().mockResolvedValue('fresh')
		const read = withCache({ cache: null }, handler)

		expect(await read('key', 'value')).toBe('fresh')
		expect(handler).toHaveBeenCalledWith('key', 'value')
		await read.clear('key')
	})

	it('uses unprefixed keys when no namespace is configured', async () => {
		const cache = {
			get: vi.fn().mockResolvedValue(undefined),
			set: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
			has: vi.fn(),
			clear: vi.fn(),
			acquireLock: vi.fn(),
			usingLock: vi.fn(),
		}
		const read = withCache({ cache }, (key: string) => Promise.resolve(`${key}:fresh`))

		expect(await read('key')).toBe('key:fresh')
		expect(cache.get).toHaveBeenCalledWith('key')
		expect(cache.set).toHaveBeenCalledWith('key', 'key:fresh')
		await read.clear('key')
		expect(cache.delete).toHaveBeenCalledWith('key')
	})
})
