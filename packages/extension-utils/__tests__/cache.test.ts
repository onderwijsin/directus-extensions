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

import {
	initializeCache,
	registerCollectionCacheInvalidation,
	withCache,
} from '../src/server/cache'

const createCacheMock = () => ({
	get: vi.fn(),
	set: vi.fn(),
	delete: vi.fn(),
	has: vi.fn(),
	clear: vi.fn(),
	acquireLock: vi.fn(),
	usingLock: vi.fn(),
})

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

	it('allows callers to isolate Redis keys with a custom namespace', () => {
		mocks.createCache.mockReturnValue({})

		initializeCache(
			{ CACHE_ENABLED: true, CACHE_STORE: 'redis', REDIS: 'redis://localhost' },
			{ ttl: 2000, namespace: 'directus:policies' },
		)

		expect(mocks.createCache).toHaveBeenCalledWith({
			type: 'redis',
			namespace: 'directus:policies',
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
		const cache = createCacheMock()
		cache.get.mockResolvedValueOnce(undefined).mockResolvedValueOnce('cached')
		cache.set.mockResolvedValue(undefined)
		const handler = vi.fn().mockResolvedValue('fresh')

		expect(await withCache({ cache, key: 'summary:orders' }, handler)).toBe('fresh')
		expect(await withCache({ cache, key: 'summary:orders' }, handler)).toBe('cached')
		expect(handler).toHaveBeenCalledOnce()
		expect(cache.get).toHaveBeenNthCalledWith(1, 'summary:orders')
		expect(cache.set).toHaveBeenCalledWith('summary:orders', 'fresh')
	})

	it('bypasses cache operations when no cache is configured', async () => {
		const handler = vi.fn().mockResolvedValue('fresh')

		expect(await withCache({ cache: null, key: 'summary:orders' }, handler)).toBe('fresh')
		expect(handler).toHaveBeenCalledOnce()
	})

	it('uses the explicit key for cache reads and writes', async () => {
		const cache = createCacheMock()
		cache.get.mockResolvedValue(undefined)
		cache.set.mockResolvedValue(undefined)

		expect(
			await withCache({ cache, key: 'sluggernaut:fields:articles' }, () =>
				Promise.resolve(['title']),
			),
		).toEqual(['title'])
		expect(cache.get).toHaveBeenCalledWith('sluggernaut:fields:articles')
		expect(cache.set).toHaveBeenCalledWith('sluggernaut:fields:articles', ['title'])
	})
})

describe('registerCollectionCacheInvalidation', () => {
	it('registers collection events and deletes the derived key', async () => {
		const cache = createCacheMock()
		cache.delete.mockResolvedValue(undefined)
		const action = vi.fn<(event: string, handler: (meta: unknown) => void) => void>()
		const context = { logger: { error: vi.fn() } } as never

		registerCollectionCacheInvalidation(
			'articles',
			{ cache, key: (collection) => `fields:${collection}` },
			{ action } as never,
			context,
		)

		expect(action).toHaveBeenNthCalledWith(1, 'items.articles.create', expect.any(Function))
		expect(action).toHaveBeenNthCalledWith(2, 'items.articles.update', expect.any(Function))
		expect(action).toHaveBeenNthCalledWith(3, 'items.articles.delete', expect.any(Function))

		const updateHandler = action.mock.calls[1]?.[1]
		if (typeof updateHandler !== 'function') throw new Error('Expected update handler')
		updateHandler({ collection: 'articles' })
		await Promise.resolve()

		expect(cache.delete).toHaveBeenCalledWith('fields:articles')
	})

	it('does not register events when caching is disabled', () => {
		const action = vi.fn<(event: string, handler: (meta: unknown) => void) => void>()

		registerCollectionCacheInvalidation(
			'articles',
			{ cache: null, key: (collection) => `fields:${collection}` },
			{ action } as never,
			{ logger: { error: vi.fn() } } as never,
		)

		expect(action).not.toHaveBeenCalled()
	})
})
