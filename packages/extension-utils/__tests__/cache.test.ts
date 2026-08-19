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

import { initializeCache } from '../src/server/cache'

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
		).toThrow('Redis cache requires REDIS')
	})

	it('rejects non-positive or non-finite TTL values', () => {
		for (const ttl of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() =>
				initializeCache({ CACHE_ENABLED: true, CACHE_STORE: 'memory' }, { ttl }),
			).toThrow('Cache ttl must be a finite positive number')
		}
	})
})
