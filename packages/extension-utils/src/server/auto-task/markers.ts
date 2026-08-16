import type { Kv } from '@directus/memory'
import type {
	AutoTaskMarker,
	AutoTaskMarkerStore,
	DirectusAutoTaskMarkerStoreOptions,
	FsAutoTaskMarkerStoreOptions,
} from './auto-task-core'

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { uuid } from '../../shared/uuid'
import { createFsLockProvider } from '../lock'

/**
 * Creates a process-local debounce marker store for one or more handlers.
 * @returns A marker store backed by a process-local map.
 */
export function createMemoryAutoTaskMarkerStore(): AutoTaskMarkerStore {
	const markers = new Map<string, AutoTaskMarker>()

	return {
		touch: async (identifier, updatedAt) => {
			const marker = {
				generation: (markers.get(identifier)?.generation ?? 0) + 1,
				updatedAt,
			}
			markers.set(identifier, marker)
			return marker
		},
		get: async (identifier) => markers.get(identifier),
		clear: async (identifier, generation) => {
			if (markers.get(identifier)?.generation !== generation) return false
			markers.delete(identifier)
			return true
		},
	}
}

/**
 * Creates an auto-task marker store backed by Directus' KV abstraction.
 *
 * Marker generations are incremented and updated while holding the KV lock. The supplied KV
 * instance owns the backend and its lifecycle; this adapter does not create connections.
 *
 * @param kv - Directus KV store, configured for local memory or Redis.
 * @param options - Optional key namespace.
 * @returns A Directus KV-backed marker store.
 */
export function createDirectusAutoTaskMarkerStore(
	kv: Kv,
	options: DirectusAutoTaskMarkerStoreOptions = {},
): AutoTaskMarkerStore {
	const namespace = options.namespace ?? 'extension-utils:auto-task'
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

	return {
		touch: (identifier, updatedAt) =>
			kv.usingLock(lockFor(identifier), async () => {
				if (!Number.isFinite(updatedAt)) {
					throw new RangeError('Auto task marker time must be finite')
				}
				const generation = await kv.increment(keyFor('generation', identifier))
				const marker = { generation, updatedAt }
				await kv.set(keyFor('marker', identifier), marker)
				return marker
			}),
		get: (identifier) => kv.get<AutoTaskMarker>(keyFor('marker', identifier)),
		clear: (identifier, generation) =>
			kv.usingLock(lockFor(identifier), async () => {
				const marker = await kv.get<AutoTaskMarker>(keyFor('marker', identifier))
				if (marker?.generation !== generation) return false
				await kv.delete(keyFor('marker', identifier))
				return true
			}),
	}
}

/** Options for the explicit local-filesystem marker store. */
/** Maps a debounce identifier to its marker filename.
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

/** Reads and validates a marker file, treating a missing file as no marker.
 * @param path - Marker file path.
 * @returns The marker or `undefined`.
 */
const readMarker = async (path: string): Promise<AutoTaskMarker | undefined> => {
	try {
		const content = await readFile(path, 'utf8')
		const value: unknown = JSON.parse(content)
		if (
			typeof value !== 'object' ||
			value === null ||
			!('generation' in value) ||
			typeof value.generation !== 'number' ||
			!Number.isSafeInteger(value.generation) ||
			value.generation < 1 ||
			!('updatedAt' in value) ||
			typeof value.updatedAt !== 'number' ||
			!Number.isFinite(value.updatedAt)
		) {
			throw new Error(`Invalid auto-task marker: ${path}`)
		}
		return { generation: value.generation, updatedAt: value.updatedAt }
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return undefined
		}
		throw error
	}
}

/** Reads the durable generation counter, treating a missing file as generation zero.
 * @param path - Generation file path.
 * @returns The stored generation.
 */
const readGeneration = async (path: string): Promise<number> => {
	try {
		const value = Number(await readFile(path, 'utf8'))
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new Error(`Invalid auto-task marker generation: ${path}`)
		}
		return value
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return 0
		}
		throw error
	}
}

/**
 * Creates a marker store for processes sharing an explicit filesystem directory.
 *
 * Marker updates are serialized by a filesystem lock provider by default. The directory is never
 * selected from `tmpdir()`; use the Redis adapter when application replicas do not share storage.
 *
 * @param options - Shared directory and optional coordination provider.
 * @returns A filesystem-backed marker store.
 */
export function createFsAutoTaskMarkerStore(
	options: FsAutoTaskMarkerStoreOptions,
): AutoTaskMarkerStore {
	if (options.directory.trim().length === 0) {
		throw new TypeError('Auto task marker directory must not be empty')
	}
	const lockTimeoutMs = options.lockTimeoutMs ?? 5000
	if (!Number.isFinite(lockTimeoutMs) || lockTimeoutMs <= 0) {
		throw new RangeError('Auto task marker lockTimeoutMs must be a finite positive number')
	}
	const lockProvider =
		options.lockProvider ?? createFsLockProvider({ directory: options.directory })
	/** Resolves the marker path for one identifier.
	 * @param identifier - Logical marker identifier.
	 * @returns Marker file path.
	 */
	const pathFor = (identifier: string) => join(options.directory, markerFileName(identifier))
	/** Resolves the durable generation path for one identifier.
	 * @param identifier - Logical marker identifier.
	 * @returns Generation file path.
	 */
	const generationPathFor = (identifier: string) =>
		join(options.directory, generationFileName(identifier))

	/** Serializes one marker operation and always releases its owner-bound lease.
	 * @param identifier - Logical marker identifier.
	 * @param operation - Operation to run while holding the lease.
	 * @returns The operation result.
	 */
	const withMarkerLock = async <T>(
		identifier: string,
		operation: () => Promise<T>,
	): Promise<T> => {
		const lease = await lockProvider.tryAcquire(markerLockName(identifier), {
			leaseMs: lockTimeoutMs,
		})
		if (!lease) throw new Error(`Auto task marker is busy: ${identifier}`)
		try {
			return await operation()
		} finally {
			await lease.release()
		}
	}

	return {
		touch: (identifier, updatedAt) =>
			withMarkerLock(identifier, async () => {
				if (!Number.isFinite(updatedAt)) {
					throw new RangeError('Auto task marker time must be finite')
				}
				await mkdir(options.directory, { recursive: true })
				const path = pathFor(identifier)
				const previous = await readMarker(path)
				const previousGeneration = await readGeneration(generationPathFor(identifier))
				const marker = {
					generation: Math.max(previous?.generation ?? 0, previousGeneration) + 1,
					updatedAt,
				}
				/** Writes a replacement file without exposing a partial JSON document.
				 * @param targetPath - Destination file path.
				 * @param content - Complete file contents.
				 * @returns A promise that resolves after the rename.
				 */
				const writeAtomic = async (targetPath: string, content: string): Promise<void> => {
					const temporaryPath = `${targetPath}.${uuid()}.tmp`
					await writeFile(temporaryPath, content, {
						encoding: 'utf8',
						flag: 'wx',
					})
					await rename(temporaryPath, targetPath)
				}
				await writeAtomic(generationPathFor(identifier), String(marker.generation))
				await writeAtomic(path, JSON.stringify(marker))
				return marker
			}),
		get: (identifier) => withMarkerLock(identifier, () => readMarker(pathFor(identifier))),
		clear: (identifier, generation) =>
			withMarkerLock(identifier, async () => {
				const path = pathFor(identifier)
				const marker = await readMarker(path)
				if (marker?.generation !== generation) return false
				await rm(path, { force: true })
				return true
			}),
	}
}
