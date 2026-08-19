import { isRecord } from '@onderwijsin/directus-extension-utils'
import {
	cacheConfigSchema,
	createLogger,
	resolveRedisConnectionString,
} from '@onderwijsin/directus-extension-utils/server'
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
	const redisConfig = cacheConfigSchema.safeParse({
		REDIS: process.env.REDIS,
		REDIS_ENABLED: process.env.REDIS_ENABLED === 'true',
		REDIS_HOST: process.env.REDIS_HOST,
		REDIS_PORT: process.env.REDIS_PORT,
		REDIS_USERNAME: process.env.REDIS_USERNAME,
		REDIS_PASSWORD: process.env.REDIS_PASSWORD,
	})
	if (!redisConfig.success) return
	const redisUrl = resolveRedisConnectionString(redisConfig.data)
	if (!redisUrl) return
	const record = isRecord(meta) ? meta : {}
	const logger = createLogger()
	const redis = new Redis(redisUrl)
	redis.on('error', (error: Error) => logger.error({ msg: 'Redis E2E client failed', error }))

	try {
		const attempts = await runAttemptSmokeTest()
		const guards = runGuardSmokeTest(record)
		const cache = await runCacheSmokeTest(redis)
		const locks = await runLockSmokeTest(redisUrl)
		const markers = await runMarkerSmokeTest(redis)
		const values = runValueSmokeTest(record, attempts.retry, attempts.async)
		const runs = await runAutoTaskSmokeTest(markers.fileStorage, logger)

		logger.info({ msg: 'utilities', ...values.loggerFields })
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
