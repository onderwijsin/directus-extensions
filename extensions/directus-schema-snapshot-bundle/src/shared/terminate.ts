import process from 'node:process'

import { parseBooleanEnv } from './parseBooleanEnv'

/**
 * Overload: force a hard exit and never return to the caller.
 *
 * @param {number} exitCode Process exit code.
 * @param {{ hardExit: true }} options Must specify `{ hardExit: true }` to guarantee termination.
 * @returns Never returns after a forced process exit.
 * @example
 * return terminate(1, { hardExit: true })
 */
export function terminate(exitCode: number, options: { hardExit: true }): never

/**
 * Terminates the process (hard) or sets `process.exitCode` (soft), depending on options or env.
 *
 * Context
 * - Executed as a standalone step during container startup, before the app starts.
 * - Docker CMD uses `&&`; a non-zero exit code must stop the boot sequence.
 *
 * Behavior
 * - Hard-exit by default:
 *   - If applying the snapshot fails, we must not start Directus with a mismatched schema.
 *   - Failing fast prevents booting into an invalid state.
 * - Soft-exit (optional):
 *   - For local debugging, you can disable hard exit so only `process.exitCode` is set.
 *
 * Control
 * - Priority: `options.hardExit` (if provided) overrides env.
 * - Env: `SCHEMA_SPLIT_HARD_EXIT`
 *   - When unset, defaults to hard exit.
 *   - Set to "false" or "0" to enable soft-exit.
 *
 * Usage
 * - Prefer `return terminate(code)` at call sites to ensure no further code runs in soft mode.
 * - Use `return terminate(code, { hardExit: true })` to force termination regardless of env.
 *
 * @param {number} exitCode Process exit code.
 * @param {{ hardExit?: boolean }} [options] Optional behavior flags.
 * @param {boolean} [options.hardExit] When true, forces a hard exit regardless of env.
 * @returns Nothing after setting the exit code in soft mode.
 * @example
 * // Default (env-driven, hard-exit by default):
 * return terminate(1)
 *
 * // Soft-exit for local debugging:
 * return terminate(1, { hardExit: false })
 */
export function terminate(exitCode: number, options?: { hardExit?: boolean }): void
export function terminate(exitCode: number, options?: { hardExit?: boolean }): void {
	const envRaw = process.env.SCHEMA_SPLIT_HARD_EXIT
	const hardExit = options?.hardExit ?? (envRaw === undefined ? true : parseBooleanEnv(envRaw))

	if (hardExit) {
		process.exit(exitCode)
	} else {
		process.exitCode = exitCode
	}
}
