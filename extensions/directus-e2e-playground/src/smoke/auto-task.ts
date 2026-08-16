import {
	createAutoTaskHandler,
	createMemoryLockProvider,
	type AutoTaskMarkerStore,
	type LoggerLike,
} from '@onderwijsin/directus-extension-utils'

/**
 * Runs one debounced task against the file marker store.
 * @param markerStore - Marker store used by the task handler.
 * @param logger - Logger used for task lifecycle messages.
 * @returns The number of task executions.
 */
export const runAutoTaskSmokeTest = async (
	markerStore: AutoTaskMarkerStore,
	logger: LoggerLike,
) => {
	let runs = 0
	const handler = createAutoTaskHandler({
		debounceId: 'e2e-playground',
		task: () => {
			runs += 1
		},
		lockProvider: createMemoryLockProvider({ tokenFactory: () => 'auto-task-token' }),
		markerStore,
		debounceMs: 0,
		markerLeaseMs: 1000,
		taskLeaseMs: 1000,
		logger,
	})

	await handler()
	await new Promise<void>((resolve) => setTimeout(resolve, 0))
	handler.dispose()
	return runs
}
