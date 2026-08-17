import type { LockProvider } from '../lock/lock-core'
import type {
	AutoTaskMarker,
	AutoTaskMarkerStore,
	FsMarkerStoreOptions,
	RedisMarkerStoreOptions,
} from './auto-task-core'

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createKv } from '@directus/memory'
import Redis from 'ioredis'

import { attempt, attemptWithRetry } from '../../shared/attempt'
import { hasKey, isFiniteNumber, isNonBlankString, isRecord } from '../../shared/guards'
import { uuid } from '../../shared/uuid'
import { createFsLockProvider } from '../lock'
import { validateRedisNamespace, validateRedisUrl } from '../redis-config'

/**
 * Parses a persisted auto-task marker at the storage boundary.
 * @param value - Unknown marker value read from storage.
 * @returns The validated marker, or `undefined` when no marker exists.
 */
const parseAutoTaskMarker = (value: unknown): AutoTaskMarker | undefined => {
	if (value === undefined) return undefined
	if (
		!isRecord(value) ||
		!hasKey(value, 'generation') ||
		!isFiniteNumber(value.generation) ||
		!Number.isSafeInteger(value.generation) ||
		value.generation < 1 ||
		!hasKey(value, 'updatedAt') ||
		!isFiniteNumber(value.updatedAt)
	)
		throw new Error('Invalid auto-task marker')
	return { generation: value.generation, updatedAt: value.updatedAt }
}

/**
 * Creates a marker store backed by Directus' Redis KV abstraction.
 *
 * Marker generations are incremented and updated while holding the KV lock. The supplied KV
 * instance owns the backend and its lifecycle; this adapter does not create connections.
 *
 * @param options - Redis connection and namespace configuration.
 * @returns A Redis-backed marker store with connection disposal.
 */
export function createRedisMarkerStore(options: RedisMarkerStoreOptions): AutoTaskMarkerStore & {
	dispose(): Promise<void>
} {
	const redisUrl = validateRedisUrl(options.redisUrl)
	const namespace = validateRedisNamespace(
		options.namespace ?? 'extension-utils:auto-task',
		'Marker namespace',
	)
	const lockTimeoutMs = options.lockTimeoutMs ?? 5000
	if (!isFiniteNumber(lockTimeoutMs) || lockTimeoutMs <= 0) {
		throw new RangeError('Auto task marker lockTimeoutMs must be a finite positive number')
	}
	const ownsRedis = options.redis === undefined
	const redis = options.redis ?? new Redis(redisUrl)
	const kv = createKv({
		type: 'redis',
		namespace,
		redis,
		lockTimeout: lockTimeoutMs,
	})
	/**
	 * Maps a marker kind and identifier to a namespaced KV key.
	 * @param kind - Marker key kind.
	 * @param identifier - Logical marker identifier.
	 * @returns The namespaced KV key.
	 */
	const keyFor = (kind: string, identifier: string): string =>
		`${namespace}:${encodeURIComponent(identifier)}:${kind}`
	/**
	 * Maps an identifier to the lock key protecting its marker updates.
	 * @param identifier - Logical marker identifier.
	 * @returns The namespaced lock key.
	 */
	const lockFor = (identifier: string): string =>
		`${namespace}:${encodeURIComponent(identifier)}:lock`

	let disposed = false
	return {
		/**
		 * Records a Redis-backed marker generation while holding its update lock.
		 * @param identifier - Logical marker identifier.
		 * @param updatedAt - Trigger timestamp.
		 * @returns The new marker.
		 */
		touch: (identifier, updatedAt) =>
			kv.usingLock(lockFor(identifier), async () => {
				if (!isFiniteNumber(updatedAt)) {
					throw new RangeError('Auto task marker time must be finite')
				}
				const generation = await kv.increment(keyFor('generation', identifier))
				const marker = { generation, updatedAt }
				await kv.set(keyFor('marker', identifier), marker)
				return marker
			}),
		/**
		 * Reads a Redis-backed marker.
		 * @param identifier - Logical marker identifier.
		 * @returns The marker, or `undefined` when none exists.
		 */
		get: async (identifier) =>
			parseAutoTaskMarker(await kv.get<unknown>(keyFor('marker', identifier))),
		/**
		 * Clears a Redis-backed marker only when its generation still matches.
		 * @param identifier - Logical marker identifier.
		 * @param generation - Expected marker generation.
		 * @returns Whether the marker was cleared.
		 */
		clear: (identifier, generation) =>
			kv.usingLock(lockFor(identifier), async () => {
				const marker = parseAutoTaskMarker(
					await kv.get<unknown>(keyFor('marker', identifier)),
				)
				if (marker?.generation !== generation) return false
				await kv.delete(keyFor('marker', identifier))
				return true
			}),
		/**
		 * Closes the Redis connection when this store owns it.
		 * @returns A promise that resolves after disposal.
		 */
		dispose: async () => {
			if (disposed) return
			disposed = true
			if (ownsRedis) await redis.quit()
		},
	}
}

/** Options for the explicit local-filesystem marker store. */
/**
 * Maps a debounce identifier to its marker filename.
 * @param identifier - Logical marker identifier.
 * @returns Marker filename.
 */
const markerFileName = (identifier: string): string =>
	`${encodeURIComponent(identifier)}.auto-task-marker.json`

/** Maps a debounce identifier to its durable generation filename.
 * @param identifier - Logical marker identifier.
 * @returns Generation filename.
 */
const generationFileName = (identifier: string): string =>
	`${encodeURIComponent(identifier)}.auto-task-generation`

/** Maps a debounce identifier to the lock name guarding its files.
 * @param identifier - Logical marker identifier.
 * @returns Marker lock name.
 */
const markerLockName = (identifier: string): string =>
	`extension-utils:auto-task-marker:${encodeURIComponent(identifier)}`

/**
 * Writes a replacement file without exposing a partial JSON document.
 * @param targetPath - Destination file path.
 * @param content - Complete file contents.
 * @returns A promise that resolves after the rename.
 */
const writeAtomic = async (targetPath: string, content: string): Promise<void> => {
	const temporaryPath = `${targetPath}.${uuid()}.tmp`
	await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' })
	await rename(temporaryPath, targetPath)
}

/**
 * Re-throws a marker failure as an Error.
 * @param error - Failure to re-throw.
 * @returns Never returns.
 */
const raiseMarkerError = (error: unknown): never => {
	if (error instanceof Error) throw error
	throw new Error('Auto task marker operation failed')
}

/**
 * Reads and validates a marker file, treating a missing file as no marker.
 * @param path - Marker file path.
 * @returns The marker or `undefined`.
 */
const readMarker = async (path: string): Promise<AutoTaskMarker | undefined> => {
	const result = await attempt(async () => JSON.parse(await readFile(path, 'utf8')) as unknown)
	if (result.error !== null) {
		if (
			isRecord(result.error) &&
			hasKey(result.error, 'code') &&
			result.error.code === 'ENOENT'
		) {
			return undefined
		}
		raiseMarkerError(result.error)
	}
	try {
		return parseAutoTaskMarker(result.data)
	} catch {
		throw new Error(`Invalid auto-task marker: ${path}`)
	}
}

/**
 * Reads the durable generation counter, treating a missing file as generation zero.
 * @param path - Generation file path.
 * @returns The stored generation.
 */
const readGeneration = async (path: string): Promise<number> => {
	const result = await attempt(async () => Number(await readFile(path, 'utf8')))
	if (result.error !== null) {
		if (
			isRecord(result.error) &&
			hasKey(result.error, 'code') &&
			result.error.code === 'ENOENT'
		) {
			return 0
		}
		raiseMarkerError(result.error)
	}
	if (result.data === null || !Number.isSafeInteger(result.data) || result.data < 0) {
		throw new Error(`Invalid auto-task marker generation: ${path}`)
	}
	return result.data
}

interface FsMarkerConfig {
	directory: string
	lockTimeoutMs: number
	lockProvider: LockProvider
}

/**
 * Validates and normalizes filesystem marker configuration.
 * @param options - Filesystem marker options.
 * @returns Normalized marker configuration.
 */
const validateFsMarkerConfig = (options: FsMarkerStoreOptions): FsMarkerConfig => {
	if (!isNonBlankString(options.directory)) {
		throw new TypeError('Auto task marker directory must not be empty')
	}
	const lockTimeoutMs = options.lockTimeoutMs ?? 5000
	if (!isFiniteNumber(lockTimeoutMs) || lockTimeoutMs <= 0) {
		throw new RangeError('Auto task marker lockTimeoutMs must be a finite positive number')
	}
	return {
		directory: options.directory,
		lockTimeoutMs,
		lockProvider:
			options.lockProvider ?? createFsLockProvider({ directory: options.directory }),
	}
}

/**
 * Runs one marker operation while holding its cross-process lease.
 * @param config - Filesystem marker configuration.
 * @param identifier - Logical marker identifier.
 * @param operation - Operation to execute under the marker lease.
 * @returns The operation result.
 */
const withMarkerLock = async <T>(
	config: FsMarkerConfig,
	identifier: string,
	operation: () => Promise<T>,
): Promise<T> => {
	const result = await attemptWithRetry(
		async () => {
			const lease = await config.lockProvider.tryAcquire(markerLockName(identifier), {
				leaseMs: config.lockTimeoutMs,
			})
			if (!lease) throw new Error(`Auto task marker is busy: ${identifier}`)
			return lease
		},
		{ attempts: 10, delayMs: 10, exponentialBackoff: false },
	)
	if (result.error !== null) raiseMarkerError(result.error)
	if (result.data === null) throw new Error(`Auto task marker is busy: ${identifier}`)
	const lease = result.data
	const operationResult = await attempt(operation)
	const releaseResult = await attempt(() => lease.release())
	if (releaseResult.error !== null) raiseMarkerError(releaseResult.error)
	if (operationResult.error !== null) raiseMarkerError(operationResult.error)
	if (operationResult.data === null)
		throw new Error('Auto task marker operation returned no result')
	return operationResult.data
}

/**
 * Serializes marker operations for one identifier within a store instance.
 * @param queues - Per-identifier operation queues.
 * @param identifier - Logical marker identifier.
 * @param operation - Marker operation to enqueue.
 * @returns The queued operation result.
 */
const queueMarkerOperation = <T>(
	queues: Map<string, Promise<unknown>>,
	identifier: string,
	operation: () => Promise<T>,
): Promise<T> => {
	const previous = queues.get(identifier) ?? Promise.resolve()
	const current = previous.catch(() => undefined).then(operation)
	queues.set(identifier, current)
	return current.then(
		(value) => {
			if (queues.get(identifier) === current) queues.delete(identifier)
			return value
		},
		(error: unknown) => {
			if (queues.get(identifier) === current) queues.delete(identifier)
			throw error
		},
	)
}

/**
 * Touches a filesystem marker while holding its marker lease.
 * @param config - Filesystem marker configuration.
 * @param identifier - Logical marker identifier.
 * @param updatedAt - Trigger timestamp.
 * @returns The new marker generation.
 */
const touchFsMarker = async (
	config: FsMarkerConfig,
	identifier: string,
	updatedAt: number,
): Promise<AutoTaskMarker> =>
	withMarkerLock(config, identifier, async () => {
		if (!isFiniteNumber(updatedAt)) {
			throw new RangeError('Auto task marker time must be finite')
		}
		await mkdir(config.directory, { recursive: true })
		const markerPath = join(config.directory, markerFileName(identifier))
		const previous = await readMarker(markerPath)
		const previousGeneration = await readGeneration(
			join(config.directory, generationFileName(identifier)),
		)
		const marker = {
			generation: Math.max(previous?.generation ?? 0, previousGeneration) + 1,
			updatedAt,
		}
		await writeAtomic(
			join(config.directory, generationFileName(identifier)),
			String(marker.generation),
		)
		await writeAtomic(markerPath, JSON.stringify(marker))
		return marker
	})

/**
 * Clears a filesystem marker when its generation still matches.
 * @param config - Filesystem marker configuration.
 * @param identifier - Logical marker identifier.
 * @param generation - Expected marker generation.
 * @returns Whether the matching marker was cleared.
 */
const clearFsMarker = async (
	config: FsMarkerConfig,
	identifier: string,
	generation: number,
): Promise<boolean> =>
	withMarkerLock(config, identifier, async () => {
		const path = join(config.directory, markerFileName(identifier))
		const marker = await readMarker(path)
		if (marker?.generation !== generation) return false
		await rm(path, { force: true })
		return true
	})

/**
 * Creates a marker store for processes sharing an explicit filesystem directory.
 * @param options - Shared directory and optional coordination provider.
 * @returns A filesystem-backed marker store.
 */
export function createFsMarkerStore(options: FsMarkerStoreOptions): AutoTaskMarkerStore {
	const config = validateFsMarkerConfig(options)
	const queues = new Map<string, Promise<unknown>>()
	return {
		/**
		 * Records a filesystem-backed marker generation.
		 * @param identifier - Logical marker identifier.
		 * @param updatedAt - Trigger timestamp.
		 * @returns The new marker.
		 */
		touch: (identifier, updatedAt) =>
			queueMarkerOperation(queues, identifier, () =>
				touchFsMarker(config, identifier, updatedAt),
			),
		/**
		 * Reads a filesystem-backed marker.
		 * @param identifier - Logical marker identifier.
		 * @returns The marker, or `undefined` when none exists.
		 */
		get: (identifier) =>
			queueMarkerOperation(queues, identifier, () =>
				withMarkerLock(config, identifier, () =>
					readMarker(join(config.directory, markerFileName(identifier))),
				),
			),
		/**
		 * Clears a filesystem-backed marker only when its generation still matches.
		 * @param identifier - Logical marker identifier.
		 * @param generation - Expected marker generation.
		 * @returns Whether the marker was cleared.
		 */
		clear: (identifier, generation) =>
			queueMarkerOperation(queues, identifier, () =>
				clearFsMarker(config, identifier, generation),
			),
	}
}
