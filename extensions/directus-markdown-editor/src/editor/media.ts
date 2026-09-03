const safeProtocols = new Set(['http:', 'https:'])

/**
 * Editor callback.
 * @param value Parameter value.
 * @returns Callback result.
 */
export function sanitizeImageUrl(value: string): string | undefined {
	const source = value.trim()
	if (!source || /^(?:javascript|data|vbscript):/iu.test(source)) return undefined
	if (source.startsWith('/') || source.startsWith('./') || source.startsWith('../')) return source
	try {
		const url = new URL(source)
		return safeProtocols.has(url.protocol) ? source : undefined
	} catch {
		return undefined
	}
}

/**
 * Editor callback.
 * @param id Parameter value.
 * @returns Callback result.
 */
export function directusAssetUrl(id: string): string | undefined {
	const assetId = id.trim()
	return assetId && /^[\w-]+$/u.test(assetId) ? `/assets/${assetId}` : undefined
}
