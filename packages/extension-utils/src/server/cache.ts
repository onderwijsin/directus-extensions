import type { Cache } from '@directus/memory'

import { createCache } from '@directus/memory'
import Redis from 'ioredis'

import { isFiniteNumber } from '../shared'
import {
	cacheConfigSchema,
	resolveCacheStorage,
	resolveRedisConnectionString,
	type RedisConfig,
} from './config/cache'

const CACHE_NAMESPACE = 'directus:extensions'

/** Environment values used to select and configure an extension cache backend. */
export interface CacheEnv {
	CACHE_ENABLED: boolean
	CACHE_STORE: 'redis' | 'memory'
	REDIS_ENABLED?: boolean
	REDIS?: string
	REDIS_HOST?: string
	REDIS_PORT?: number
	REDIS_USERNAME?: string
	REDIS_PASSWORD?: string
}

/** Options shared by all extension cache instances. */
export interface CacheOptions {
	ttl: number
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
