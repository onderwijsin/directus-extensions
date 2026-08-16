import type {
	AutoTaskMarker,
	AutoTaskMarkerStore,
	MemoryTaskHandlerStorageOptions,
	TaskHandlerStorage,
} from './auto-task-core'

import { createMemoryLockProvider } from '../lock/memory-lock'

/**
 * Creates a process-local marker store backed by a memory map.
 * @returns A process-local marker store.
 */
export function createMemoryMarkerStore(): AutoTaskMarkerStore {
	const markers = new Map<string, AutoTaskMarker>()
	return {
		touch: (identifier, updatedAt) => {
			const marker = {
				generation: (markers.get(identifier)?.generation ?? 0) + 1,
				updatedAt,
			}
			markers.set(identifier, marker)
			return Promise.resolve(marker)
		},
		get: (identifier) => Promise.resolve(markers.get(identifier)),
		clear: (identifier, generation) => {
			if (markers.get(identifier)?.generation !== generation) return Promise.resolve(false)
			markers.delete(identifier)
			return Promise.resolve(true)
		},
	}
}

/**
 * Creates process-local storage for an auto-task handler.
 *
 * This storage coordinates only callers in the same process. Its dispose method is a no-op so
 * every storage provider has the same lifecycle API.
 *
 * @param options - Optional deterministic lock configuration.
 * @returns Process-local auto-task storage.
 */
export function createMemoryTaskHandlerStorage(
	options: MemoryTaskHandlerStorageOptions = {},
): TaskHandlerStorage {
	return {
		lockProvider: createMemoryLockProvider({
			defaultLeaseMs: options.lockTimeoutMs,
			now: options.now,
			tokenFactory: options.tokenFactory,
		}),
		markerStore: createMemoryMarkerStore(),
		dispose: () => Promise.resolve(),
	}
}
