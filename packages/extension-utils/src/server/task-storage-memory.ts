import { createMemoryAutoTaskMarkerStore, type AutoTaskMarkerStore } from './auto-task-handler'
import {
	createMemoryLockProvider,
	type LockProvider,
	type MemoryLockProviderOptions,
} from './lock-core'

/** The coordinated state required by an auto-task handler. */
export interface TaskHandlerStorage {
	/** Lock used to ensure only one task owner runs at a time. */
	lockProvider: LockProvider
	/** Marker store used to share the latest trigger generation. */
	markerStore: AutoTaskMarkerStore
	/** Releases resources owned by this storage. */
	dispose(): Promise<void>
}

/** Options for process-local auto-task storage. */
export interface MemoryTaskHandlerStorageOptions {
	/** Default lock lifetime when a task lease omits `leaseMs`. Defaults to 30 seconds. */
	lockTimeoutMs?: number
	/** Injectable clock for deterministic tests. */
	now?: MemoryLockProviderOptions['now']
	/** Injectable owner-token factory for deterministic tests. */
	tokenFactory?: MemoryLockProviderOptions['tokenFactory']
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
		markerStore: createMemoryAutoTaskMarkerStore(),
		dispose: () => Promise.resolve(),
	}
}
