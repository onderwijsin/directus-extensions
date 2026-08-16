import type Redis from 'ioredis'

import { uuid } from '@onderwijsin/directus-extension-utils'
import {
	createFsTaskHandlerStorage,
	createRedisMarkerStore,
} from '@onderwijsin/directus-extension-utils/server'

/**
 * Runs filesystem and Redis auto-task marker checks.
 * @param redis - Connected Redis client shared by the smoke groups.
 * @returns The marker stores and observed marker results.
 */
export const runMarkerSmokeTest = async (redis: Redis) => {
	const fileStorage = createFsTaskHandlerStorage({
		directory: `/tmp/directus-e2e-playground-markers-${uuid()}`,
		tokenFactory: (() => {
			let sequence = 0
			return () => `file-token-${++sequence}`
		})(),
	})
	const file = fileStorage.markerStore
	await file.touch('e2e', Date.now())
	const secondFileMarker = await file.touch('e2e', Date.now())
	const fileMarker = await file.get('e2e')
	const fileMarkerCleared = await file.clear('e2e', secondFileMarker.generation)

	const distributed = createRedisMarkerStore({
		redisUrl: 'redis://localhost',
		namespace: 'extension-utils:e2e:markers',
		redis,
	})
	await distributed.touch('e2e', Date.now())
	const redisMarker = await distributed.get('e2e')
	const redisMarkerCleared = await distributed.clear('e2e', redisMarker?.generation ?? 0)

	return {
		fileStorage,
		file,
		fileMarker: { generation: fileMarker?.generation, cleared: fileMarkerCleared },
		redisMarker: { generation: redisMarker?.generation, cleared: redisMarkerCleared },
	}
}
