import type Redis from 'ioredis'

import { createCache } from '@directus/memory'
import { createMemoryCache, createNamespacedCache } from '@onderwijsin/directus-extension-utils'

/**
 * Runs memory and Directus-compatible Redis cache checks.
 * @param redis - Connected Redis client shared by the smoke groups.
 * @returns The values read from both cache implementations.
 */
export const runCacheSmokeTest = async (redis: Redis) => {
	const memory = createNamespacedCache(createMemoryCache(), 'e2e')
	await memory.set('item', 'memory')

	const distributed = createCache({
		type: 'redis',
		namespace: 'extension-utils:e2e:cache',
		redis,
	})
	await distributed.set('item', 'redis')

	return {
		memory: await memory.get('item'),
		redis: await distributed.get('item'),
	}
}
