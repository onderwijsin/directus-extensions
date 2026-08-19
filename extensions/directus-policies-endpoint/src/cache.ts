import type { Cache } from '@directus/memory'

import { createCache } from '@directus/memory'
import Redis from 'ioredis'

export const POLICY_CACHE_TTL_MS = 5_000

export interface PolicyCacheOptions {
	CACHE_ENABLED: boolean
	CACHE_STORE: 'redis' | 'memory'
	REDIS?: string
}

/**
 * Creates the configured policy cache.
 *
 * @param options - Cache settings parsed from the Directus environment.
 * @returns A configured cache, or null when caching is disabled.
 */
export function initializePolicyCache(options: PolicyCacheOptions): Cache | null {
	if (!options.CACHE_ENABLED) return null

	if (options.CACHE_STORE === 'redis') {
		if (!options.REDIS) throw new Error('Redis cache requires REDIS')

		return createCache({
			type: 'redis',
			namespace: 'policies-endpoint',
			redis: new Redis(options.REDIS),
			ttl: POLICY_CACHE_TTL_MS,
		})
	}

	return createCache({ type: 'local', ttl: POLICY_CACHE_TTL_MS })
}
