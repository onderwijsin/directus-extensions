/**
 * Normalize the nullable value emitted by Directus' textarea component.
 * @param value Current textarea value.
 * @returns Trimmed prompt or an empty string.
 */
export function normalizeAiPrompt(value: string | null | undefined): string {
	return value?.trim() ?? ''
}

/**
 * Determine whether a prompt keyboard event should submit generation.
 * @param event Relevant textarea keyboard state.
 * @param prompt Current nullable prompt value.
 * @param loading Whether generation is already running.
 * @returns Whether Enter should submit instead of inserting a newline.
 */
export function shouldSubmitAiPrompt(
	event: Pick<KeyboardEvent, 'isComposing' | 'key' | 'shiftKey'>,
	prompt: string | null | undefined,
	loading: boolean,
): boolean {
	return (
		event.key === 'Enter' &&
		!event.shiftKey &&
		!event.isComposing &&
		Boolean(normalizeAiPrompt(prompt)) &&
		!loading
	)
}
