/** Explicit terminal state used by interactive CLI predicates. */
export interface InteractiveState {
	stdinIsTTY: boolean
	stdoutIsTTY: boolean
}

/** Environment values used to detect CI execution. */
export type EnvironmentValues = Record<string, string | undefined>

/**
 * Returns true when both input and output are connected to a terminal.
 * @param state - Explicit terminal state.
 * @returns Whether the process is interactive.
 */
export function isInteractive(state: InteractiveState): boolean {
	return state.stdinIsTTY && state.stdoutIsTTY
}

/**
 * Returns true when a conventional CI environment marker is present.
 * @param environment - Environment values to inspect.
 * @returns Whether a non-empty CI marker is present.
 */
export function isCiEnvironment(environment: EnvironmentValues): boolean {
	return [
		environment.CI,
		environment.CONTINUOUS_INTEGRATION,
		environment.BUILD_NUMBER,
		environment.GITHUB_ACTIONS,
	].some((value) => typeof value === 'string' && value.trim().length > 0)
}

/**
 * Returns true when confirmation should be skipped.
 * @param options - Confirmation environment and force state.
 * @returns Whether confirmation should be skipped.
 */
export function shouldSkipConfirmation(options: {
	force?: boolean
	interactive: boolean
	ci: boolean
}): boolean {
	return options.force === true || options.ci || !options.interactive
}
