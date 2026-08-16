import { attempt, attemptSync, attemptWithRetry } from '@onderwijsin/directus-extension-utils'

/**
 * Runs the synchronous, asynchronous, and retry utility checks.
 * @returns The observed attempt results.
 */
export const runAttemptSmokeTest = async () => {
	const retryCalls = { count: 0 }
	const retry = await attemptWithRetry(
		() => {
			retryCalls.count += 1
			if (retryCalls.count < 2) throw new Error('expected retry')
			return 'retried'
		},
		{ attempts: 2, delayMs: 0 },
	)

	return {
		async: (await attempt(() => Promise.resolve('async'))).data,
		sync: attemptSync(() => 'sync').data,
		retry: retry.data,
		calls: retryCalls.count,
	}
}
