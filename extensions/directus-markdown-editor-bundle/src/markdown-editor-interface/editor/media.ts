import {
	attemptSync,
	hasKey,
	isArray,
	isRecord,
	isString,
} from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

const safeProtocols = new Set(['http:', 'https:'])

/** Formats supported for newly selected Directus image assets. */
export const AssetStorageModeSchema = z.enum(['id', 'path', 'url'])
export type AssetStorageMode = z.infer<typeof AssetStorageModeSchema>

/**
 * Validate an HTTP(S) base URL used for absolute asset storage.
 * @param value Configured base URL.
 * @returns Normalized URL without a trailing slash, or nothing when invalid.
 */
export function normalizeAssetBaseUrl(value: string): string | undefined {
	const trimmed = value.trim()
	const result = attemptSync(() => new URL(trimmed))
	if (result.error || !result.data || !safeProtocols.has(result.data.protocol)) return undefined
	if (
		result.data.username ||
		result.data.password ||
		trimmed.includes('?') ||
		trimmed.includes('#')
	)
		return undefined
	return result.data.href.replace(/\/+$/u, '')
}

/**
 * Format a selected Directus asset without changing existing values.
 * @param id Selected file identifier.
 * @param mode Configured storage mode.
 * @param baseUrl Base URL required for absolute URL storage.
 * @returns Stored value or nothing when configuration or identifier is invalid.
 */
export function formatAssetValue(
	id: string,
	mode: AssetStorageMode,
	baseUrl = '',
): string | undefined {
	const path = directusAssetUrl(id)
	if (!path) return undefined
	if (mode === 'id') return id.trim()
	if (mode === 'path') return path
	const base = normalizeAssetBaseUrl(baseUrl)
	return base ? `${base}${path}` : undefined
}

/**
 * Resolve a persisted image value to a browser preview URL.
 * @param value Stored ID, path, or URL.
 * @returns Safe preview URL when available.
 */
export function imagePreviewUrl(value: string): string | undefined {
	return directusAssetUrl(value) ?? sanitizeImageUrl(value)
}

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
