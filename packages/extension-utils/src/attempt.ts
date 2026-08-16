/** The result of an operation whose failure is represented as data. */
export type AttemptResult<T> = { data: T; error: null } | { data: null; error: unknown }

/** Options controlling bounded retries for an attempted operation. */
export interface AttemptRetryOptions {
	/** Total number of operation executions. */
	attempts?: number
	/** Initial delay in milliseconds before retrying. */
	delayMs?: number
	/** Whether each retry delay doubles. @default true */
	exponentialBackoff?: boolean
}

/**
 * Attempts an operation and exposes a possible failure as data instead of throwing.
 *
 * @param operation - The synchronous or asynchronous operation to execute.
 * @returns The operation result or the captured error.
 */
export async function attempt<T>(operation: () => T | Promise<T>): Promise<AttemptResult<T>> {
	return Promise.resolve()
		.then(operation)
		.then(
			(data) => ({ data, error: null }) satisfies AttemptResult<T>,
			(error: unknown) => ({ data: null, error }) satisfies AttemptResult<T>,
		)
}

/**
 * Attempts a synchronous operation and exposes a possible failure as data instead of throwing.
 *
 * @param operation - The operation to execute.
 * @returns The operation result or the captured error.
 */
export function attemptSync<T>(operation: () => T): AttemptResult<T> {
	try {
		const data = operation()
		return { data, error: null }
	} catch (error) {
		return { data: null, error }
	}
}

/**
 * Attempts an operation until it succeeds or the total attempt budget is exhausted.
 *
 * @param operation - The operation to execute. It must be safe for the caller's retry policy.
 * @param options - Retry count and delay configuration.
 * @returns The first successful result or the final captured error.
 */
export async function attemptWithRetry<T>(
	operation: () => T | Promise<T>,
	options: AttemptRetryOptions = {},
): Promise<AttemptResult<T>> {
	const { attempts = 3, delayMs = 250, exponentialBackoff = true } = options
	let result = await attempt(operation)

	for (
		let attemptNumber = 1;
		result.error !== null && attemptNumber < attempts;
		attemptNumber += 1
	) {
		const delay = exponentialBackoff ? delayMs * 2 ** (attemptNumber - 1) : delayMs
		await new Promise<void>((resolve) => setTimeout(resolve, delay))
		result = await attempt(operation)
	}

	return result
}
