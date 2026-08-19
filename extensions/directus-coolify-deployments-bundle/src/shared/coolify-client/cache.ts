import type { CoolifyClientContext } from './types'

import { createCache, type Cache } from '@directus/memory'
import Redis from 'ioredis'

import { LIST_APPLICATION_CACHE_DURATION_MS } from '../constants'

/**
 * Creates and returns a cache instance based on the provided context. If cache is disabled, returns null
 * @param context - Coolify Client Context with cache options
 * @returns a cache instance or null if cache is disabled
 */
export function initializeCache(context: CoolifyClientContext) {
	let cache: Cache | null = null
	if (context?.cacheEnabled) {
		if (context.cacheStore === 'redis') {
			if (!context.redis) throw new Error('Redis cache requires REDIS')
			cache = createCache({
				type: 'redis',
				namespace: 'coolify-deployments',
				redis: new Redis(context.redis),
				ttl: LIST_APPLICATION_CACHE_DURATION_MS,
			})
		} else {
			cache = createCache({ type: 'local', ttl: LIST_APPLICATION_CACHE_DURATION_MS })
		}
	}

	return cache
}
