import type { AutoTaskMarker, AutoTaskMarkerStore } from '../auto-task.js'
import type { LockProvider } from '../lock.js'

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { generateUUID } from '../uuid.js'
import { createFileLockProvider } from './lock.js'

/** Options for the explicit local-filesystem marker store. */
export interface FileAutoTaskMarkerStoreOptions {
	/** Directory shared by the processes that should share debounce markers. */
	directory: string
	/** Optional provider used to serialize marker updates. */
	lockProvider?: LockProvider
	/** Lease used for one marker read/update operation. Defaults to five seconds. */
	operationLeaseMs?: number
}

const markerFileName = (identifier: string): string =>
	`${encodeURIComponent(identifier)}.auto-task-marker.json`

const generationFileName = (identifier: string): string =>
	`${encodeURIComponent(identifier)}.auto-task-generation`

const markerLockName = (identifier: string): string =>
	`extension-utils:auto-task-marker:${encodeURIComponent(identifier)}`

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
	const pathFor = (identifier: string) => join(options.directory, markerFileName(identifier))
	const generationPathFor = (identifier: string) =>
		join(options.directory, generationFileName(identifier))

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
