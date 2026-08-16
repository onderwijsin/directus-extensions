import type {
	FsTaskHandlerStorageOptions,
	RedisTaskHandlerStorageOptions,
	TaskHandlerStorage,
} from './auto-task-core'

import { createKv } from '@directus/memory'
import Redis from 'ioredis'

import { createFsLockProvider, createRedisLockProvider } from '../lock'
import { createDirectusAutoTaskMarkerStore, createFsAutoTaskMarkerStore } from './markers'

/**
 * Creates Redis-backed storage for an auto-task handler.
 *
 * One Redis connection is shared by the lock provider and Directus KV marker store. The storage
 * owns that connection and releases it through `dispose`.
 *
 * @param options - Redis connection and namespace configuration.
 * @returns Redis-backed auto-task storage.
 */
export function createRedisTaskHandlerStorage(
	options: RedisTaskHandlerStorageOptions,
): TaskHandlerStorage {
	const redisUrl = options.redisUrl.trim()
	if (redisUrl.length === 0) throw new TypeError('Redis URL must not be empty')
	const namespace =
		options.namespace === undefined ? 'directus:task-handler' : options.namespace.trim()
	if (namespace.length === 0) throw new TypeError('Task handler namespace must not be empty')
	const lockTimeoutMs = options.lockTimeoutMs ?? 5 * 60 * 1000
	if (!Number.isFinite(lockTimeoutMs) || lockTimeoutMs <= 0) {
		throw new RangeError('Task handler lockTimeoutMs must be a finite positive number')
	}
	const redis = new Redis(redisUrl)
	const lockProvider = createRedisLockProvider({
		redisUrl,
		namespace: `${namespace}:locks`,
		lockTimeoutMs,
		isContentionError: options.isContentionError,
		redis,
	})
	const kv = createKv({
		type: 'redis',
		namespace: `${namespace}:markers`,
		redis,
		lockTimeout: lockTimeoutMs,
	})
	let disposed = false

	return {
		lockProvider,
		markerStore: createDirectusAutoTaskMarkerStore(kv),
		dispose: async () => {
			if (disposed) return
			disposed = true
			await lockProvider.dispose()
			await redis.quit()
		},
	}
}

/**
 * Creates filesystem-backed storage for an auto-task handler.
 *
 * The lock and marker stores share the same explicit directory and filesystem lock provider.
 *
 * @param options - Shared directory and deterministic test configuration.
 * @returns Filesystem-backed auto-task storage.
 */
export function createFsTaskHandlerStorage(
	options: FsTaskHandlerStorageOptions,
): TaskHandlerStorage {
	const lockProvider = createFsLockProvider({
		directory: options.directory,
		now: options.now,
		tokenFactory: options.tokenFactory,
	})

	return {
		lockProvider,
		markerStore: createFsAutoTaskMarkerStore({
			directory: options.directory,
			lockProvider,
			lockTimeoutMs: options.lockTimeoutMs,
		}),
		dispose: () => Promise.resolve(),
	}
}
