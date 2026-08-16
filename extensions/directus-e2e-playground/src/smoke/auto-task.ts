import {
	createAutoTaskHandler,
	type LoggerLike,
	type TaskHandlerStorage,
} from '@onderwijsin/directus-extension-utils'

/**
 * Runs one debounced task against the supplied task handler storage.
 * @param storage - Lock and marker storage used by the task handler.
 * @param logger - Logger used for task lifecycle messages.
 * @returns The number of task executions.
 */
export const runAutoTaskSmokeTest = async (storage: TaskHandlerStorage, logger: LoggerLike) => {
	let runs = 0
	let resolveTaskCompletion: (() => void) | undefined
	const taskCompleted = new Promise<void>((resolve) => {
		resolveTaskCompletion = resolve
	})
	const handler = createAutoTaskHandler({
		debounceId: 'e2e-playground',
		task: () => {
			runs += 1
			resolveTaskCompletion?.()
		},
		storage,
		debounceMs: 0,
		markerLeaseMs: 1000,
		taskLeaseMs: 1000,
		logger,
	})

	try {
		await handler()
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error('Timed out waiting for the E2E auto-task to run')),
				60_000,
			)
			taskCompleted.then(() => {
				clearTimeout(timeout)
				resolve()
			}, reject)
		})
	} finally {
		handler.dispose()
		await storage.dispose()
	}
	return runs
}
