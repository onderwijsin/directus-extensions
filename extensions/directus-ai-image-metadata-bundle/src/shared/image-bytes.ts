import { addAbortSignal, type Readable } from 'node:stream'

import { InvalidPayloadError } from '@directus/errors'

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
				throw new InvalidPayloadError({ reason: 'Invalid image byte stream.' })
			length += chunk.byteLength
			if (length > maxBytes)
				throw new InvalidPayloadError({
					reason: 'Image exceeds AI_METADATA_WRITER_MAX_IMAGE_BYTES.',
				})
			chunks.push(chunk)
		}
	} finally {
		stream.destroy()
	}
	if (!length) throw new InvalidPayloadError({ reason: 'Image is empty.' })
	return Buffer.concat(chunks)
}
