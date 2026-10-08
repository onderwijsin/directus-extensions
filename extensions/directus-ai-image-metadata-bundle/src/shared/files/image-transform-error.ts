import { ProcessingFailure } from '../diagnostics/diagnostics'

/** Stable conversion failures, never upstream native messages. */
export type ImageTransformCode = 'IMAGE_TRANSFORM_INVALID_INPUT' | 'IMAGE_TRANSFORM_LIMIT_EXCEEDED'

/**
 * Creates an allowlisted, non-retryable image-preparation failure.
 * @param code - Stable public code.
 * @returns Sanitized staged failure.
 */
export function imageTransformFailure(code: ImageTransformCode) {
	const messages = {
		IMAGE_TRANSFORM_INVALID_INPUT:
			'Image bytes are empty, invalid, or have an unexpected format.',
		IMAGE_TRANSFORM_LIMIT_EXCEEDED: 'Image preparation exceeded its resource limit.',
	}
	return new ProcessingFailure({
		stage: 'convert_image',
		code,
		retryable: false,
		message: messages[code],
	})
}
