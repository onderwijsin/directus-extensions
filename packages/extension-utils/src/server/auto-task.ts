import type { AutoTaskMarker, AutoTaskMarkerStore } from '../shared/auto-task'
import type { LockProvider } from '../shared/lock'

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { generateUUID } from '../shared/uuid'
import { createFileLockProvider } from './lock'

/** Options for the explicit local-filesystem marker store. */
export interface FileAutoTaskMarkerStoreOptions {
	/** Directory shared by the processes that should share debounce markers. */
	directory: string
	/** Optional provider used to serialize marker updates. */
	lockProvider?: LockProvider
	/** Lease used for one marker read/update operation. Defaults to five seconds. */
	operationLeaseMs?: number
}

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
export function createFileAutoTaskMarkerStore(
	options: FileAutoTaskMarkerStoreOptions,
): AutoTaskMarkerStore {
	if (options.directory.trim().length === 0) {
		throw new TypeError('Auto task marker directory must not be empty')
	}
	const operationLeaseMs = options.operationLeaseMs ?? 5000
	if (!Number.isFinite(operationLeaseMs) || operationLeaseMs <= 0) {
		throw new RangeError('Auto task marker operationLeaseMs must be a finite positive number')
	}
	const lockProvider =
		options.lockProvider ?? createFileLockProvider({ directory: options.directory })
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
			leaseMs: operationLeaseMs,
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
					const temporaryPath = `${targetPath}.${generateUUID()}.tmp`
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
