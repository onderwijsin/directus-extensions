/** Categories returned by MIME type classification. */
export type MimeTypeCategory = 'audio' | 'video' | 'image' | 'document' | 'unknown'

/** Backwards-compatible name for MIME type categories. */
export type FileType = MimeTypeCategory

/** Default MIME types treated as documents in addition to the `text/*` family. */
export const DEFAULT_DOCUMENT_MIME_TYPES = [
	'application/json',
	'application/msword',
	'application/pdf',
	'application/rtf',
	'application/vnd.ms-excel',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/xml',
	'text/css',
	'text/csv',
	'text/html',
	'text/javascript',
	'text/plain',
	'text/rtf',
] as const

/** Options for customizing MIME classification without changing the default classifier. */
export interface MimeTypeClassificationOptions {
	/** Additional MIME types to classify as documents. */
	documentMimeTypes?: readonly string[]
}

/** Normalizes an unknown MIME value for case-insensitive classification.
 * @param mimeType - Value to normalize.
 * @returns A normalized MIME type or `null`.
 */
const normalizeMimeType = (mimeType: unknown): string | null => {
	if (typeof mimeType !== 'string') return null

	const normalized = mimeType.trim().toLowerCase()
	return normalized.length > 0 ? normalized : null
}

/**
 * Returns true when a value is an audio MIME type.
 * @param mimeType - Value to inspect.
 * @returns Whether the value is an audio MIME type.
 */
export function isAudioMimeType(mimeType: unknown): boolean {
	return normalizeMimeType(mimeType)?.startsWith('audio/') ?? false
}

/**
 * Returns true when a value is a video MIME type.
 * @param mimeType - Value to inspect.
 * @returns Whether the value is a video MIME type.
 */
export function isVideoMimeType(mimeType: unknown): boolean {
	return normalizeMimeType(mimeType)?.startsWith('video/') ?? false
}

/**
 * Returns true when a value is an image MIME type.
 * @param mimeType - Value to inspect.
 * @returns Whether the value is an image MIME type.
 */
export function isImageMimeType(mimeType: unknown): boolean {
	return normalizeMimeType(mimeType)?.startsWith('image/') ?? false
}

/**
 * Returns true when a value is a document MIME type.
 * @param mimeType - Value to inspect.
 * @param options - Optional document registry extensions.
 * @returns Whether the value is a document MIME type.
 */
export function isDocumentMimeType(
	mimeType: unknown,
	options: MimeTypeClassificationOptions = {},
): boolean {
	const normalized = normalizeMimeType(mimeType)
	if (!normalized) return false
	if (normalized.startsWith('text/')) return true

	const documentMimeTypes = new Set([
		...DEFAULT_DOCUMENT_MIME_TYPES,
		...(options.documentMimeTypes ?? [])
			.map(normalizeMimeType)
			.filter((value): value is string => value !== null),
	])

	return documentMimeTypes.has(normalized)
}

/**
 * Classifies a MIME type using the default registry and optional document extensions.
 * @param mimeType - Value to classify.
 * @param options - Optional document registry extensions.
 * @returns The MIME type category.
 */
export function classifyMimeType(
	mimeType: unknown,
	options: MimeTypeClassificationOptions = {},
): MimeTypeCategory {
	if (isAudioMimeType(mimeType)) return 'audio'
	if (isVideoMimeType(mimeType)) return 'video'
	if (isImageMimeType(mimeType)) return 'image'
	if (isDocumentMimeType(mimeType, options)) return 'document'
	return 'unknown'
}

/** Alias for consumers migrating from the copied Directus utility. */
export const getFileType = classifyMimeType
