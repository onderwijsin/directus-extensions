/**
 * Normalizes a display value into an absolute path.
 * @param value - Stored slug or permalink.
 * @returns A normalized path, or null for an empty value.
 */
export function displayPath(value: string | null | undefined): string | null {
	if (value === null || value === undefined || value.trim() === '') return null
	const trimmed = value.trim()
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * Validates an optional display host.
 * @param host - Configured host value.
 * @returns A normalized HTTP(S) origin, or null when invalid or absent.
 */
export function displayHost(host: string | null | undefined): string | null {
	if (host === null || host === undefined || host.trim() === '') return null
	try {
		const url = new URL(host.trim())
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
		if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null
		if (url.username !== '' || url.password !== '') return null
		return url.origin
	} catch {
		return null
	}
}

/**
 * Builds an optional absolute link for a display value.
 * @param value - Stored slug or permalink.
 * @param host - Optional HTTP(S) origin.
 * @returns An absolute URL, or null when no valid host is configured.
 */
export function displayHref(
	value: string | null | undefined,
	host: string | null | undefined,
): string | null {
	const path = displayPath(value)
	const origin = displayHost(host)
	if (path === null || origin === null) return null
	return new URL(path, origin).toString()
}
