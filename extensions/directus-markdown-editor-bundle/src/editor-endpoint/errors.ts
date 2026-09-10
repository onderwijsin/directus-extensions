import { createError, isDirectusError } from '@directus/errors'

interface EditorAiErrorExtensions {
	reason: string
}

export const EditorAiForbiddenError = createError<EditorAiErrorExtensions>(
	'EDITOR_AI_FORBIDDEN',
	({ reason }) => reason,
	403,
)
export const EditorAiInvalidPayloadError = createError<EditorAiErrorExtensions>(
	'EDITOR_AI_INVALID_PAYLOAD',
	({ reason }) => reason,
	400,
)
export const EditorAiUnavailableError = createError<EditorAiErrorExtensions>(
	'EDITOR_AI_UNAVAILABLE',
	({ reason }) => reason,
	502,
)

/**
 * Preserve Directus errors and safely translate unknown provider failures.
 * @param error Error raised inside the endpoint.
 * @returns A Directus-compatible error safe to expose.
 */
export function toEditorAiError(error: unknown): Error {
	return isDirectusError(error)
		? error
		: new EditorAiUnavailableError({ reason: 'The editor AI provider is unavailable.' })
}
