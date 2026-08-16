import { describe, expect, it, vi } from 'vitest'

import {
	createMemoryCache,
	createNamespacedCache,
	createRedisCache,
	type RedisCacheClient,
} from '../src/index.js'

describe('cache utilities', () => {
	it('stores, reads, overwrites, deletes, and clears memory entries', async () => {
		const cache = createMemoryCache()

		expect(await cache.get('missing')).toBeUndefined()
		await cache.set('item', { value: 1 })
		expect(await cache.get<{ value: number }>('item')).toEqual({ value: 1 })
		await cache.set('item', { value: 2 })
		expect(await cache.get<{ value: number }>('item')).toEqual({ value: 2 })
		expect(await cache.delete('item')).toBe(true)
		expect(await cache.delete('item')).toBe(false)
		await cache.set('another', 'value')
		await cache.clear?.()
		expect(await cache.get('another')).toBeUndefined()
	})

	it('expires memory entries at their configured TTL', async () => {
		let currentTime = 1000
		const cache = createMemoryCache({ now: () => currentTime })

		await cache.set('short', 'value', { ttlMs: 50 })
		expect(await cache.get('short')).toBe('value')
		currentTime = 1050
		expect(await cache.get('short')).toBeUndefined()
		expect(await cache.delete('short')).toBe(false)

		await cache.set('immediate', 'value', { ttlMs: 0 })
		expect(await cache.get('immediate')).toBeUndefined()
	})

	it('removes an old expiry when an entry is overwritten without a TTL', async () => {
		let currentTime = 1000
		const cache = createMemoryCache({ now: () => currentTime })

		await cache.set('item', 'temporary', { ttlMs: 50 })
		await cache.set('item', 'persistent')
		currentTime = 5000

		expect(await cache.get('item')).toBe('persistent')
	})

	it('rejects clock failures from memory reads and deletes', async () => {
		const failure = new Error('clock unavailable')
		const cache = createMemoryCache({
			now: () => {
				throw failure
			},
		})
		await cache.set('item', 'value')

		await expect(cache.get('item')).rejects.toBe(failure)
		await expect(cache.delete('item')).rejects.toBe(failure)
	})

	it('rejects invalid TTL values without changing existing entries', async () => {
		const cache = createMemoryCache()
		await cache.set('item', 'original')

		await expect(cache.set('item', 'negative', { ttlMs: -1 })).rejects.toThrow(RangeError)
		await expect(
			cache.set('item', 'infinite', { ttlMs: Number.POSITIVE_INFINITY }),
		).rejects.toThrow(RangeError)
		expect(await cache.get('item')).toBe('original')
	})

	it('isolates namespaced keys while delegating to the underlying store', async () => {
		const store = createMemoryCache()
		const first = createNamespacedCache(store, 'first')
		const second = createNamespacedCache(store, 'second')

		await first.set('item', 'one')
		await second.set('item', 'two')

		expect(await first.get('item')).toBe('one')
		expect(await second.get('item')).toBe('two')
		expect(await store.get('first:item')).toBe('one')
		expect(await first.delete('item')).toBe(true)
		expect(await second.get('item')).toBe('two')
	})

	it('uses Redis JSON serialization and Redis PX expiration', async () => {
		const values = new Map<string, string>()
		const get = vi.fn((key: string) => Promise.resolve(values.get(key) ?? null))
		const set = vi.fn((key: string, value: string, ...arguments_: unknown[]) => {
			values.set(key, value)
			expect(arguments_).toEqual(['PX', 100])
			return Promise.resolve('OK')
		})
		const del = vi.fn((key: string) => Promise.resolve(Number(values.delete(key))))
		const client: RedisCacheClient = {
			get,
			set,
			del,
		}
		const cache = createRedisCache(client)

		await cache.set('item', { enabled: true }, { ttlMs: 100 })
		expect(await cache.get<{ enabled: boolean }>('item')).toEqual({ enabled: true })
		expect(await cache.delete('item')).toBe(true)
		expect(await cache.delete('item')).toBe(false)
		expect(set).toHaveBeenCalledWith('item', '{"enabled":true}', 'PX', 100)
	})

	it('returns undefined for Redis misses and omits PX without a TTL', async () => {
		const get = vi.fn(() => Promise.resolve(null))
		const set = vi.fn(() => Promise.resolve('OK'))
		const client: RedisCacheClient = {
			get,
			set,
			del: () => Promise.resolve(0),
		}
		const cache = createRedisCache(client)

		expect(await cache.get('missing')).toBeUndefined()
		await cache.set('item', 'value')
		expect(set).toHaveBeenCalledWith('item', '"value"')
	})

	it('rejects invalid Redis TTL values before contacting the backend', async () => {
		const set = vi.fn(() => Promise.resolve('OK'))
		const client: RedisCacheClient = {
			get: () => Promise.resolve(null),
			set,
			del: () => Promise.resolve(0),
		}
		const cache = createRedisCache(client)

		await expect(cache.set('negative', 'value', { ttlMs: -1 })).rejects.toThrow(RangeError)
		await expect(cache.set('nan', 'value', { ttlMs: Number.NaN })).rejects.toThrow(RangeError)
		expect(set).not.toHaveBeenCalled()
	})

	it('propagates malformed Redis payloads and codec failures', async () => {
		const malformedClient: RedisCacheClient = {
			get: () => Promise.resolve('{malformed'),
			set: () => Promise.resolve('OK'),
			del: () => Promise.resolve(0),
		}
		await expect(createRedisCache(malformedClient).get('item')).rejects.toThrow(SyntaxError)

		const codecFailure = new Error('codec failed')
		const codec = {
			serialize: () => {
				throw codecFailure
			},
			deserialize: <T>(): T => {
				throw codecFailure
			},
		}
		const client: RedisCacheClient = {
			get: () => Promise.resolve('encoded'),
			set: () => Promise.resolve('OK'),
			del: () => Promise.resolve(0),
		}
		const cache = createRedisCache(client, { codec })

		await expect(cache.get('item')).rejects.toBe(codecFailure)
		await expect(cache.set('item', 'value')).rejects.toBe(codecFailure)
	})

	it('supports custom Redis codecs and propagates backend failures', async () => {
		const get = vi.fn(() => Promise.resolve('encoded:value'))
		const set = vi.fn(() => Promise.resolve('OK'))
		const del = vi.fn(() => Promise.resolve(0))
		const client: RedisCacheClient = {
			get,
			set,
			del,
		}
		const codec = {
			serialize: vi.fn((value: unknown) => `encoded:${String(value)}`),
			deserialize: <T>(value: string): T =>
				JSON.parse(JSON.stringify(value.replace('encoded:', ''))) as T,
		}
		const cache = createRedisCache(client, { codec })

		expect(await cache.get('item')).toBe('value')
		await cache.set('item', 'value')
		expect(codec.serialize).toHaveBeenCalledWith('value')
		expect(await cache.delete('missing')).toBe(false)

		const failure = new Error('redis unavailable')
		const failingClient: RedisCacheClient = {
			get: () => Promise.reject(failure),
			set: () => Promise.reject(failure),
			del: () => Promise.reject(failure),
		}
		const failingCache = createRedisCache(failingClient)

		await expect(failingCache.get('item')).rejects.toBe(failure)
		await expect(failingCache.set('item', 'value')).rejects.toBe(failure)
		await expect(failingCache.delete('item')).rejects.toBe(failure)
	})

	it('rejects values that cannot be represented by the default Redis codec', async () => {
		const client: RedisCacheClient = {
			get: () => Promise.resolve(null),
			set: () => Promise.resolve('OK'),
			del: () => Promise.resolve(0),
		}

		await expect(createRedisCache(client).set('item', undefined)).rejects.toThrow(TypeError)
	})

	it('does not expose an unsafe clear operation for Redis', () => {
		const client: RedisCacheClient = {
			get: () => Promise.resolve(null),
			set: () => Promise.resolve('OK'),
			del: () => Promise.resolve(0),
		}

		expect('clear' in createRedisCache(client)).toBe(false)
	})
})
