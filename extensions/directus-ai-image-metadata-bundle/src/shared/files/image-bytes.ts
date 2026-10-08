import { addAbortSignal, type Readable } from 'node:stream'

import { imageTransformFailure } from './image-transform-error'

/**
 * Collects bounded private image bytes and always releases the source stream.
 * @param source - Directus asset stream.
 * @param signal - Shared download and generation timeout.
 * @param maxBytes - Maximum permitted image size.
 * @returns Nonempty image bytes.
 */
export async function readImageBytes(source: Readable, signal: AbortSignal, maxBytes: number) {
	const stream = addAbortSignal(signal, source)
	const chunks: Uint8Array[] = []
	let length = 0
	try {
		for await (const rawChunk of stream) {
			const chunk: unknown = rawChunk
			if (!(chunk instanceof Uint8Array))
				throw imageTransformFailure('IMAGE_TRANSFORM_INVALID_INPUT')
			length += chunk.byteLength
			if (length > maxBytes) throw imageTransformFailure('IMAGE_TRANSFORM_LIMIT_EXCEEDED')
			chunks.push(chunk)
		}
	} finally {
		stream.destroy()
	}
	if (!length) throw imageTransformFailure('IMAGE_TRANSFORM_INVALID_INPUT')
	return Buffer.concat(chunks)
}
