import type { Cache } from '@directus/memory'

import { createCache } from '@directus/memory'
import Redis from 'ioredis'
import { z } from 'zod'

import { isFiniteNumber } from '../shared'
import {
	cacheConfigSchema,
	resolveCacheStorage,
	resolveRedisConnectionString,
	type RedisConfig,
} from './config/cache'

const CACHE_NAMESPACE = 'directus:extensions'

/** Environment values used to select and configure an extension cache backend. */
export type CacheEnv = z.input<typeof cacheConfigSchema>

/** Options shared by all extension cache instances. */
export interface CacheOptions {
	ttl: number
}

/** Options for wrapping a handler with cache-backed reads and writes. */
export interface WithCacheOptions {
	cache: Cache | null
	namespace?: string
}

export type CachedHandler<TArgs extends readonly unknown[], TResult> = ((
	key: string,
	...args: TArgs
) => Promise<TResult>) & {
	clear(key: string): Promise<void>
}

/**
 * Wraps an asynchronous handler with an optional namespaced cache lookup.
 *
 * The returned function receives a logical cache key first and forwards it, followed by any
 * additional arguments, to the handler. Cache reads, writes, and deletes are prefixed with the
 * namespace. A null cache behaves as a disabled cache and always invokes the handler. When no
 * namespace is supplied, keys are passed to the cache unchanged.
 * @param options - Cache backend and optional key namespace used for reads and writes.
 * @param handler - Asynchronous operation to run after a cache miss.
 * @returns A cached asynchronous handler.
 */
export function withCache<TArgs extends readonly unknown[], TResult>(
	options: WithCacheOptions,
	handler: (key: string, ...args: TArgs) => Promise<TResult>,
): CachedHandler<TArgs, TResult> {
	const { cache, namespace } = options
	const prefix =
		namespace === undefined ? '' : namespace.endsWith(':') ? namespace : `${namespace}:`
	/**
	 * Builds the backend key for a logical key.
	 * @param key - Logical cache key.
	 * @returns The namespace-prefixed cache key.
	 */
	const scopedKey = (key: string) => `${prefix}${key}`
	/**
	 * Reads a value from the namespace or computes it on a miss.
	 * @param key - Logical cache key.
	 * @param args - Additional arguments forwarded to the cache-miss handler.
	 * @returns The cached or freshly computed value.
	 */
	const read = async (key: string, ...args: TArgs) => {
		const cacheKey = scopedKey(key)
		const cached = await cache?.get<TResult>(cacheKey)
		if (cached !== undefined) return cached

		const result = await handler(key, ...args)
		await cache?.set(cacheKey, result)
		return result
	}
	return Object.assign(read, {
		/**
		 * Deletes one value from the namespace.
		 * @param key - Logical cache key.
		 * @returns A promise that resolves after deletion.
		 */
		clear: async (key: string): Promise<void> => {
			await cache?.delete(scopedKey(key))
		},
	})
}

/**
 * Creates the configured Directus extension cache.
 *
 * @param env - Validated cache environment values.
 * @param options - Cache instance options.
 * @returns A configured cache, or null when caching is disabled.
 */
export function initializeCache(env: CacheEnv, options: CacheOptions): Cache | null {
	if (!isFiniteNumber(options.ttl) || options.ttl <= 0) {
		throw new TypeError('Cache ttl must be a finite positive number')
	}

	const config = cacheConfigSchema.parse(env)
	const storage = resolveCacheStorage(config)
	if (storage === 'redis') {
		const redisUrl = resolveRedisConnectionString(config)
		if (!redisUrl) throw new Error('Redis cache requires REDIS or all Redis component values')

		return createCache({
			type: 'redis',
			namespace: CACHE_NAMESPACE,
			redis: new Redis(redisUrl),
			ttl: options.ttl,
		})
	}

	return storage === 'memory' ? createCache({ type: 'local', ttl: options.ttl }) : null
}

export type { RedisConfig }
