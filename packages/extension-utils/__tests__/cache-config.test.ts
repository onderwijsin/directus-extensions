import { describe, expect, it } from 'vitest'

import {
	cacheConfigSchema,
	resolveCacheStorage,
	resolveRedisConnectionString,
} from '../src/server/config/cache'

describe('cache configuration', () => {
	it('provides Directus cache and Redis defaults', () => {
		expect(cacheConfigSchema.parse({})).toEqual({
			CACHE_ENABLED: false,
			CACHE_STORE: 'memory',
			REDIS_ENABLED: false,
		})
	})

	it('prefers a complete REDIS URL over component values', () => {
		expect(
			resolveRedisConnectionString(
				cacheConfigSchema.parse({
					REDIS: ' redis://url.example/0 ',
					REDIS_ENABLED: true,
					REDIS_HOST: 'component.example',
					REDIS_PORT: 6380,
					REDIS_USERNAME: 'user',
					REDIS_PASSWORD: 'pass',
				}),
			),
		).toBe('redis://url.example/0')
	})

	it('constructs a URL and encodes credentials', () => {
		expect(
			resolveRedisConnectionString(
				cacheConfigSchema.parse({
					REDIS_ENABLED: true,
					REDIS_HOST: 'cache.example',
					REDIS_PORT: 6379,
					REDIS_USERNAME: 'user@example.com',
					REDIS_PASSWORD: 'p@ss word',
				}),
			),
		).toBe('redis://user%40example.com:p%40ss%20word@cache.example:6379')
	})

	it('requires all Redis components when component configuration is used', () => {
		expect(
			cacheConfigSchema.safeParse({ REDIS_ENABLED: true, REDIS_HOST: 'cache.example' })
				.success,
		).toBe(false)
		expect(
			cacheConfigSchema.safeParse({
				REDIS_ENABLED: true,
				REDIS_HOST: 'cache.example',
				REDIS_PORT: 6379,
				REDIS_USERNAME: 'user',
			}).success,
		).toBe(false)
	})

	it('resolves public cache storage values', () => {
		expect(resolveCacheStorage(cacheConfigSchema.parse({}))).toBeNull()
		expect(resolveCacheStorage(cacheConfigSchema.parse({ CACHE_ENABLED: true }))).toBe('memory')
		expect(
			resolveCacheStorage(
				cacheConfigSchema.parse({
					CACHE_ENABLED: true,
					CACHE_STORE: 'redis',
					REDIS: 'redis://cache',
				}),
			),
		).toBe('redis')
	})

	it('rejects an unresolved Redis cache store', () => {
		expect(
			cacheConfigSchema.safeParse({ CACHE_ENABLED: true, CACHE_STORE: 'redis' }).success,
		).toBe(false)
		expect(
			cacheConfigSchema.safeParse({
				CACHE_ENABLED: true,
				CACHE_STORE: 'redis',
				REDIS_HOST: 'cache.example',
				REDIS_PORT: 6379,
				REDIS_USERNAME: 'user',
				REDIS_PASSWORD: 'password',
			}).success,
		).toBe(false)
	})
})
