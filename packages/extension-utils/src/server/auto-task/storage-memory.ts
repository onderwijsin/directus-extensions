import type { MemoryTaskHandlerStorageOptions, TaskHandlerStorage } from './auto-task-core'

import { createMemoryLockProvider } from '../lock/memory-lock'
import { createMemoryAutoTaskMarkerStore } from './markers'

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
		markerStore: createMemoryAutoTaskMarkerStore(),
		dispose: () => Promise.resolve(),
	}
}
