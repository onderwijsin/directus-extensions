import { isRecord } from '@onderwijsin/directus-extension-utils'
import { createLogger } from '@onderwijsin/directus-extension-utils/server'
import Redis from 'ioredis'

import { runAttemptSmokeTest } from './attempts'
import { runAutoTaskSmokeTest } from './auto-task'
import { runCacheSmokeTest } from './cache'
import { runGuardSmokeTest } from './guards'
import { runLockSmokeTest } from './locks'
import { runMarkerSmokeTest } from './markers'
import { runValueSmokeTest } from './values'

/**
 * Executes every utility smoke group and logs one stable, consumer-visible result payload.
 * @param meta - Directus event metadata supplied by the create hook.
 * @returns A promise that resolves after all smoke groups complete.
 */
export const runUtilitySmokeTest = async (meta: unknown): Promise<void> => {
	if (!process.env.REDIS) return
	const record = isRecord(meta) ? meta : {}
	const logger = createLogger({
		info: (message, fields) =>
			console.log(`directus-e2e-playground logger: ${message}`, fields),
	})
	const redis = new Redis(process.env.REDIS)
	redis.on('error', (error: Error) => logger.error('Redis E2E client failed', { error }))

	try {
		const attempts = await runAttemptSmokeTest()
		const guards = runGuardSmokeTest(record)
		const cache = await runCacheSmokeTest(redis)
		const locks = await runLockSmokeTest(process.env.REDIS)
		const markers = await runMarkerSmokeTest(redis)
		const values = runValueSmokeTest(record, attempts.retry, attempts.async)
		const runs = await runAutoTaskSmokeTest(markers.fileStorage, logger)

		logger.info('utilities', values.loggerFields)
		console.log(
			`directus-e2e-playground: utilities ${JSON.stringify({
				guards,
				attempts,
				object: values.object,
				types: values.types,
				loggerFields: values.loggerFields,
				cache,
				locks,
				autoTask: {
					runs,
					fileMarkerGeneration: markers.fileMarker.generation,
					fileMarkerCleared: markers.fileMarker.cleared,
					redisMarkerGeneration: markers.redisMarker.generation,
					redisMarkerCleared: markers.redisMarker.cleared,
				},
			})}`,
		)
	} finally {
		await redis.quit()
	}
}
