/** Input MIME types transformable by Directus AssetsService (Directus 12.2). */
export const imageMimeTypes = Object.freeze([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/tiff',
	'image/avif',
])

/**
 * Keeps diagnostic MIME labels bounded and prevents arbitrary persisted text entering logs.
 * @param value - Untrusted stored MIME declaration.
 * @returns A normalized MIME label or undefined when malformed.
 */
export function diagnosticMimeType(value: string | null | undefined) {
	const mime = value?.trim().toLowerCase()
	return mime && mime.length <= 127 && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/u.test(mime)
		? mime
		: undefined
}
