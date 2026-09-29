import {
	attemptSync,
	hasKey,
	isArray,
	isRecord,
	isString,
} from '@onderwijsin/directus-extension-utils'

const safeProtocols = new Set(['http:', 'https:'])

/**
 * Validates an image source and rejects scriptable or unsupported URL schemes.
 * @param value Candidate image URL or relative asset path.
 * @returns The original trimmed URL when it is safe, otherwise `undefined`.
 */
export function sanitizeImageUrl(value: string): string | undefined {
	const source = value.trim()
	if (!source || /^(?:javascript|data|vbscript):/iu.test(source)) return undefined
	if (source.startsWith('/') || source.startsWith('./') || source.startsWith('../')) return source
	const result = attemptSync(() => new URL(source))
	return result.error === null && result.data && safeProtocols.has(result.data.protocol)
		? source
		: undefined
}

/**
 * Builds a Directus asset URL for a syntactically valid asset identifier.
 * @param id Directus asset identifier to validate.
 * @returns A relative asset URL, or `undefined` for an invalid identifier.
 */
export function directusAssetUrl(id: string): string | undefined {
	const assetId = id.trim()
	return assetId && /^[\w-]+$/u.test(assetId) ? `/assets/${assetId}` : undefined
}

/**
 * Resolve the identifier from a single-file VUpload result.
 * @param value File object or single-item file array emitted by Directus.
 * @returns The selected asset identifier when valid.
 */
export function directusAssetId(value: unknown): string | undefined {
	const file = isArray(value) ? value[0] : value
	if (!isRecord(file) || !hasKey(file, 'id') || !isString(file.id)) return undefined
	const id = file.id.trim()
	return directusAssetUrl(id) ? id : undefined
}
