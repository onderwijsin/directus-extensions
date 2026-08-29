export interface OriginRequest {
	get: (header: string) => string | undefined
	protocol: string
}

/**
 * Check a browser request's Origin or Referer against the public Directus origin.
 *
 * Requests without either header are allowed so authenticated non-browser clients
 * such as Flow and curl can still use the endpoint. Authentication and Directus
 * permissions remain the actual access controls.
 * @param request - Request metadata needed for origin comparison.
 * @param publicUrl - Optional configured public Directus URL.
 * @returns Whether the request is same-origin or has no browser origin metadata.
 */
export const isSameOriginRequest = (request: OriginRequest, publicUrl?: string): boolean => {
	const origin = request.get('origin') ?? request.get('referer')
	if (!origin) return true
	if (origin === 'null') return false

	try {
		const candidate = new URL(origin)
		if (publicUrl) return candidate.origin === new URL(publicUrl).origin

		// Express must resolve trusted proxy headers before this fallback. Reading
		// X-Forwarded-* directly would let an untrusted client manufacture the public origin.
		const expected = `${request.protocol}://${request.get('host') ?? ''}`

		return candidate.origin === new URL(expected).origin
	} catch {
		return false
	}
}
