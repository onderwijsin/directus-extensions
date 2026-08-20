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
 * @returns Whether the request is same-origin or has no browser origin metadata.
 */
export const isSameOriginRequest = (request: OriginRequest): boolean => {
	const origin = request.get('origin') ?? request.get('referer')
	if (!origin) return true
	if (origin === 'null') return false

	try {
		const candidate = new URL(origin)
		// Express must resolve trusted proxy headers before this boundary. Reading
		// X-Forwarded-* directly would let an untrusted client manufacture the public origin.
		const protocol = request.protocol
		const host = request.get('host')

		return host != null && candidate.protocol === `${protocol}:` && candidate.host === host
	} catch {
		return false
	}
}
