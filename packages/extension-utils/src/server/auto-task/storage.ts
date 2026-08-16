import type {
	FsTaskHandlerStorageOptions,
	RedisTaskHandlerStorageOptions,
	TaskHandlerStorage,
} from './auto-task-core'

import Redis from 'ioredis'

import { isFiniteNumber } from '../../shared/guards'
import { createFsLockProvider, createRedisLockProvider } from '../lock'
import { validateRedisNamespace, validateRedisUrl } from '../redis-config'
import { createFsMarkerStore, createRedisMarkerStore } from './markers'

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
	const redisUrl = validateRedisUrl(options.redisUrl)
	const namespace = validateRedisNamespace(
		options.namespace ?? 'directus:task-handler',
		'Task handler namespace',
	)
	const lockTimeoutMs = options.lockTimeoutMs ?? 5 * 60 * 1000
	if (!Number.isFinite(lockTimeoutMs) || lockTimeoutMs <= 0) {
		throw new RangeError('Task handler lockTimeoutMs must be a finite positive number')
	}
	const redis = new Redis(redisUrl)
	const lockProvider = createRedisLockProvider({
		redisUrl,
		namespace: `${namespace}:locks`,
		defaultLeaseMs: lockTimeoutMs,
		isContentionError: options.isContentionError,
		redis,
	})
	const markerStore = createRedisMarkerStore({
		redisUrl,
		namespace: `${namespace}:markers`,
		lockTimeoutMs,
		redis,
	})
	let disposed = false

	return {
		lockProvider,
		markerStore,
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
	if (options.lockTimeoutMs !== undefined && !isFiniteNumber(options.lockTimeoutMs)) {
		throw new RangeError('Auto task marker lockTimeoutMs must be a finite positive number')
	}
	if (options.lockTimeoutMs !== undefined && options.lockTimeoutMs <= 0) {
		throw new RangeError('Auto task marker lockTimeoutMs must be a finite positive number')
	}
	const lockProvider = createFsLockProvider({
		directory: options.directory,
		defaultLeaseMs: options.lockTimeoutMs,
		now: options.now,
		tokenFactory: options.tokenFactory,
	})

	return {
		lockProvider,
		markerStore: createFsMarkerStore({
			directory: options.directory,
			lockProvider,
			lockTimeoutMs: options.lockTimeoutMs,
		}),
		dispose: () => Promise.resolve(),
	}
}
