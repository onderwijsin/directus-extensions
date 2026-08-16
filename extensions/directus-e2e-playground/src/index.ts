import type {
	Geometry,
	PartialNested,
	RedisCacheClient,
	RedisAutoTaskMarkerClient,
	RedisLockClient,
} from '@onderwijsin/directus-extension-utils'

import { defineHook } from '@directus/extensions-sdk'
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
	createRedisCache,
	createRedisLockProvider,
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
import {
	createFileAutoTaskMarkerStore,
	createFileLockProvider,
} from '@onderwijsin/directus-extension-utils/server'

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
		const redisLockValues = new Map<string, string>()
		const redisLockClient: RedisLockClient = {
			set: async (key, value, ...arguments_) => {
				if (arguments_.includes('NX') && redisLockValues.has(key)) return null
				redisLockValues.set(key, value)
				return 'OK'
			},
			eval: async (script, _numberOfKeys, key, token) => {
				if (redisLockValues.get(String(key)) !== token) return 0
				if (script.includes('del')) redisLockValues.delete(String(key))
				return 1
			},
		}
		const redisLock = createRedisLockProvider(redisLockClient, {
			tokenFactory: () => 'redis-token',
		})
		const redisLease = await redisLock.tryAcquire('item', { leaseMs: 1000 })
		const redisContended = await redisLock.tryAcquire('item')
		await redisLease?.release()
		const fileMarkerStore = createFileAutoTaskMarkerStore({
			directory: `/tmp/directus-e2e-playground-markers-${generateUUID()}`,
		})
		await fileMarkerStore.touch('e2e', Date.now())
		const secondFileMarker = await fileMarkerStore.touch('e2e', Date.now())
		const fileMarker = await fileMarkerStore.get('e2e')
		const fileMarkerCleared = await fileMarkerStore.clear('e2e', secondFileMarker.generation)
		let redisMarkerGeneration = 0
		const redisMarkerValues = new Map<string, string>()
		const redisMarkerClient: RedisAutoTaskMarkerClient = {
			get: async (key) => redisMarkerValues.get(key) ?? null,
			eval: async (script, _numberOfKeys, generationKey, markerKey, value) => {
				if (script.includes('incr')) {
					redisMarkerGeneration += 1
					redisMarkerValues.set(String(generationKey), String(redisMarkerGeneration))
					redisMarkerValues.set(
						String(markerKey),
						`${redisMarkerGeneration}:${String(value)}`,
					)
					return redisMarkerGeneration
				}
				if (redisMarkerValues.get(String(generationKey)) !== String(value)) return 0
				redisMarkerValues.delete(String(markerKey))
				return 1
			},
		}
		const redisMarkerStore = createRedisAutoTaskMarkerStore(redisMarkerClient)
		await redisMarkerStore.touch('e2e', Date.now())
		const redisMarker = await redisMarkerStore.get('e2e')
		const redisMarkerCleared = await redisMarkerStore.clear('e2e', redisMarker?.generation ?? 0)
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
				locks: {
					memoryContended: memoryContended === null,
					fileContended: fileContended === null,
					redisContended: redisContended === null,
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
