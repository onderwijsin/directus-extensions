import type { Cache } from '@directus/memory'

import { createCache } from '@directus/memory'
import Redis from 'ioredis'

import { isFiniteNumber } from '../shared'

const CACHE_NAMESPACE = 'directus:extensions'

/** Environment values used to select and configure an extension cache backend. */
export interface CacheEnv {
	CACHE_ENABLED: boolean
	CACHE_STORE: 'redis' | 'memory'
	REDIS?: string
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
	if (!env.CACHE_ENABLED) return null
	if (!isFiniteNumber(options.ttl) || options.ttl <= 0) {
		throw new TypeError('Cache ttl must be a finite positive number')
	}

	if (env.CACHE_STORE === 'redis') {
		if (!env.REDIS) throw new Error('Redis cache requires REDIS')

		return createCache({
			type: 'redis',
			namespace: CACHE_NAMESPACE,
			redis: new Redis(env.REDIS),
			ttl: options.ttl,
		})
	}

	return createCache({ type: 'local', ttl: options.ttl })
}
