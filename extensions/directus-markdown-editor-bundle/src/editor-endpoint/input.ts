import { EditorAiInvalidPayloadError } from './errors'
import { type EditorAiRequest, editorAiRequestSchema } from './request'

/**
 * Validates an editor AI request and applies the configured content limit.
 * @param body - Untrusted request body.
 * @param maxContentLength - Maximum replacement or document-context length.
 * @returns Validated editor AI input.
 */
export function parseEditorAiInput(body: unknown, maxContentLength: number): EditorAiRequest {
	const parsed = editorAiRequestSchema.safeParse(body)
	if (!parsed.success)
		throw new EditorAiInvalidPayloadError({
			reason: parsed.error.issues.map((issue) => issue.message).join('; '),
		})

	const inputLength = parsed.data.content?.length ?? parsed.data.insertion?.document.length ?? 0
	if (inputLength > maxContentLength)
		throw new EditorAiInvalidPayloadError({ reason: 'Content exceeds the configured limit' })

	return parsed.data
}
