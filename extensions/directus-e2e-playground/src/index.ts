import type {
	Geometry,
	PartialNested,
	RedisCacheClient,
} from '@onderwijsin/directus-extension-utils'

import { defineHook } from '@directus/extensions-sdk'
import {
	attempt,
	attemptSync,
	attemptWithRetry,
	classifyMimeType,
	createLogger,
	createMemoryCache,
	createNamespacedCache,
	createRedisCache,
	fromEntries,
	generateDeterministicUUID,
	generateUUID,
	getFileType,
	hasKey,
	hasKeys,
	isArray,
	isAudioMimeType,
	isBoolean,
	isCiEnvironment,
	isDefined,
	isDocumentMimeType,
	isFiniteNumber,
	isFunction,
	isImageMimeType,
	isInteractive,
	isInteger,
	isNumber,
	isNonBlankString,
	isNonEmptyString,
	isRecord,
	isString,
	isVideoMimeType,
	keys,
	shouldSkipConfirmation,
	toEntries,
} from '@onderwijsin/directus-extension-utils'

export default defineHook(({ action }) => {
	const logger = createLogger({
		info: (message, fields) =>
			console.log(`directus-e2e-playground logger: ${message}`, fields),
	})

	const runUtilitySmokeTest = async (meta: unknown): Promise<void> => {
		const record = isRecord(meta) ? meta : {}
		const retryCalls = { count: 0 }
		const retry = await attemptWithRetry(
			() => {
				retryCalls.count += 1
				if (retryCalls.count < 2) throw new Error('expected retry')
				return 'retried'
			},
			{ attempts: 2, delayMs: 0 },
		)
		const asyncAttempt = await attempt(() => Promise.resolve('async'))
		const syncAttempt = attemptSync(() => 'sync')
		const memoryCache = createMemoryCache()
		const namespacedCache = createNamespacedCache(memoryCache, 'e2e')
		await namespacedCache.set('item', 'memory')
		const redisValues = new Map<string, string>()
		const redisClient: RedisCacheClient = {
			get: (key) => Promise.resolve(redisValues.get(key) ?? null),
			set: (key, value) => {
				redisValues.set(key, value)
				return Promise.resolve('OK')
			},
			del: (key) => Promise.resolve(Number(redisValues.delete(key))),
		}
		const redisCache = createRedisCache(redisClient)
		await redisCache.set('item', 'redis')
		const object = { collection: record.collection ?? 'unknown', retry: retry.data }
		const entries = toEntries(object)
		const rebuilt = fromEntries(entries)
		const point: Geometry = { type: 'Point', coordinates: [4.9, 52.3] }
		const partial: PartialNested<{ nested: { enabled: boolean } }> = { nested: {} }
		const loggerFields = {
			attempt: asyncAttempt.data,
			classification: classifyMimeType('application/json'),
			deterministicUuid: generateDeterministicUUID('e2e-playground'),
			uuid: generateUUID(),
		}

		logger.info('utilities', loggerFields)
		console.log(
			`directus-e2e-playground: utilities ${JSON.stringify({
				guards: {
					array: isArray([]),
					audio: isAudioMimeType('audio/mpeg'),
					boolean: isBoolean(true),
					defined: isDefined('value'),
					document: isDocumentMimeType('application/json'),
					finite: isFiniteNumber(1),
					function: isFunction(() => undefined),
					hasKey: hasKey(record, 'collection'),
					hasKeys: hasKeys(record),
					image: isImageMimeType('image/png'),
					integer: isInteger(1),
					number: isNumber(1),
					nonBlank: isNonBlankString('value'),
					nonEmpty: isNonEmptyString('value'),
					record: isRecord(record),
					string: isString('value'),
					video: isVideoMimeType('video/mp4'),
				},
				environment: {
					ci: isCiEnvironment({ CI: 'true' }),
					interactive: isInteractive({ stdinIsTTY: true, stdoutIsTTY: true }),
					skipConfirmation: shouldSkipConfirmation({ interactive: true, ci: false }),
				},
				attempts: {
					async: asyncAttempt.data,
					sync: syncAttempt.data,
					retry: retry.data,
					calls: retryCalls.count,
				},
				object: { entries, keys: keys(object), rebuilt },
				types: { point, partial },
				loggerFields: { ...loggerFields, fileType: getFileType('text/plain') },
				cache: {
					memory: await namespacedCache.get('item'),
					redis: await redisCache.get('item'),
				},
			})}`,
		)
	}

	/**
	 * Creates a Directus item event logger.
	 * @param event - Lifecycle event label to include in the log message.
	 * @returns A handler that logs the collection for the lifecycle event.
	 */
	const logItemEvent = (event: string) => {
		/**
		 * Logs a Directus item lifecycle event.
		 * @param meta - Directus event metadata.
		 * @returns Nothing.
		 */
		return (meta: unknown): void => {
			const record = isRecord(meta) ? meta : {}
			const collection = isString(record.collection) ? record.collection : 'unknown'
			const key =
				isString(record.key) || typeof record.key === 'number'
					? record.key
					: Array.isArray(record.keys)
						? record.keys.join(',')
						: 'unknown'

			console.log(
				`directus-e2e-playground: item-event ${JSON.stringify({ event, collection, key: String(key) })}`,
			)
		}
	}

	action('items.create', (meta: unknown) => {
		logItemEvent('created')(meta)
		void runUtilitySmokeTest(meta)
	})
	action('items.update', logItemEvent('updated'))
	action('items.delete', logItemEvent('deleted'))
})
