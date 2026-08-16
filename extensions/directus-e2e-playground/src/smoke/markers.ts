import type { RedisAutoTaskMarkerClient } from '@onderwijsin/directus-extension-utils'
import type Redis from 'ioredis'

import { createRedisAutoTaskMarkerStore, generateUUID } from '@onderwijsin/directus-extension-utils'
import { createFileAutoTaskMarkerStore } from '@onderwijsin/directus-extension-utils/server'

/**
 * Runs filesystem and Redis auto-task marker checks.
 * @param redis - Connected Redis client shared by the smoke groups.
 * @returns The marker stores and observed marker results.
 */
export const runMarkerSmokeTest = async (redis: Redis) => {
	const file = createFileAutoTaskMarkerStore({
		directory: `/tmp/directus-e2e-playground-markers-${generateUUID()}`,
	})
	await file.touch('e2e', Date.now())
	const secondFileMarker = await file.touch('e2e', Date.now())
	const fileMarker = await file.get('e2e')
	const fileMarkerCleared = await file.clear('e2e', secondFileMarker.generation)

	const client: RedisAutoTaskMarkerClient = {
		get: (key) => redis.get(key),
		eval: (script, numberOfKeys, ...arguments_) =>
			redis.eval(script, numberOfKeys, ...arguments_.map(String)),
	}
	const distributed = createRedisAutoTaskMarkerStore(client)
	await distributed.touch('e2e', Date.now())
	const redisMarker = await distributed.get('e2e')
	const redisMarkerCleared = await distributed.clear('e2e', redisMarker?.generation ?? 0)

	return {
		file,
		fileMarker: { generation: fileMarker?.generation, cleared: fileMarkerCleared },
		redisMarker: { generation: redisMarker?.generation, cleared: redisMarkerCleared },
	}
}
