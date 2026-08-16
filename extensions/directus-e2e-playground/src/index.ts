import type {
	Geometry,
	PartialNested,
	RedisAutoTaskMarkerClient,
} from '@onderwijsin/directus-extension-utils'

import { defineHook } from '@directus/extensions-sdk'
import { createCache, createKv } from '@directus/memory'
import {
	attempt,
	attemptSync,
	attemptWithRetry,
	createAutoTaskHandler,
	createRedisAutoTaskMarkerStore,
	classifyMimeType,
	createLogger,
	createMemoryCache,
	createMemoryLockProvider,
	createNamespacedCache,
	fromEntries,
	generateDeterministicUUID,
	generateUUID,
	getFileType,
	hasKey,
	hasKeys,
	isArray,
	isAudioMimeType,
	isBoolean,
	isDefined,
	isDocumentMimeType,
	isFiniteNumber,
	isFunction,
	isImageMimeType,
	isInteger,
	isNumber,
	isNonBlankString,
	isNonEmptyString,
	isRecord,
	isString,
	isVideoMimeType,
	keys,
	toEntries,
} from '@onderwijsin/directus-extension-utils'
import {
	createFileAutoTaskMarkerStore,
	createFileLockProvider,
} from '@onderwijsin/directus-extension-utils/server'
import Redis from 'ioredis'

export default defineHook(({ action }) => {
	const logger = createLogger({
		info: (message, fields) =>
			console.log(`directus-e2e-playground logger: ${message}`, fields),
	})

	const runUtilitySmokeTest = async (meta: unknown): Promise<void> => {
		if (!process.env.REDIS) return
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
		const redisConnection = new Redis(process.env.REDIS)
		redisConnection.on('error', (error: Error) =>
			logger.error('Redis E2E client failed', { error }),
		)
		const redisCache = createCache({
			type: 'redis',
			namespace: 'extension-utils:e2e:cache',
			redis: redisConnection,
		})
		await redisCache.set('item', 'redis')
		const memoryLock = createMemoryLockProvider({ tokenFactory: () => 'memory-token' })
		const memoryLease = await memoryLock.tryAcquire('item', { leaseMs: 1000 })
		const memoryContended = await memoryLock.tryAcquire('item')
		await memoryLease?.release()
		const fileLock = createFileLockProvider({
			directory: `/tmp/directus-e2e-playground-locks-${generateUUID()}`,
			tokenFactory: (() => {
				let sequence = 0
				return () => `file-token-${++sequence}`
			})(),
		})
		const fileLease = await fileLock.tryAcquire('item', { leaseMs: 1000 })
		const fileContended = await fileLock.tryAcquire('item')
		await fileLease?.release()
		const redisLock = createKv({
			type: 'redis',
			namespace: 'extension-utils:e2e:lock',
			redis: redisConnection,
			lockTimeout: 1000,
		})
		let redisLockUsed = false
		await redisLock.usingLock('item', async () => {
			redisLockUsed = true
		})
		const fileMarkerStore = createFileAutoTaskMarkerStore({
			directory: `/tmp/directus-e2e-playground-markers-${generateUUID()}`,
		})
		await fileMarkerStore.touch('e2e', Date.now())
		const secondFileMarker = await fileMarkerStore.touch('e2e', Date.now())
		const fileMarker = await fileMarkerStore.get('e2e')
		const fileMarkerCleared = await fileMarkerStore.clear('e2e', secondFileMarker.generation)
		const redisMarkerClient: RedisAutoTaskMarkerClient = {
			get: (key) => redisConnection.get(key),
			eval: (script, numberOfKeys, ...arguments_) =>
				redisConnection.eval(script, numberOfKeys, ...arguments_.map(String)),
		}
		const redisMarkerStore = createRedisAutoTaskMarkerStore(redisMarkerClient)
		await redisMarkerStore.touch('e2e', Date.now())
		const redisMarker = await redisMarkerStore.get('e2e')
		const redisMarkerCleared = await redisMarkerStore.clear('e2e', redisMarker?.generation ?? 0)
		await redisConnection.quit()
		let autoTaskRuns = 0
		const autoTask = createAutoTaskHandler({
			debounceId: 'e2e-playground',
			task: () => {
				autoTaskRuns += 1
			},
			lockProvider: createMemoryLockProvider({ tokenFactory: () => 'auto-task-token' }),
			markerStore: fileMarkerStore,
			debounceMs: 0,
			markerLeaseMs: 1000,
			taskLeaseMs: 1000,
			logger,
		})
		await autoTask()
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		autoTask.dispose()
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
				locks: {
					memoryContended: memoryContended === null,
					fileContended: fileContended === null,
					redisLockUsed,
				},
				autoTask: {
					runs: autoTaskRuns,
					fileMarkerGeneration: fileMarker?.generation,
					fileMarkerCleared,
					redisMarkerGeneration: redisMarker?.generation,
					redisMarkerCleared,
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
