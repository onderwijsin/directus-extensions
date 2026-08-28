/**
 * Parses a redirect URL accepted by the magic-link allowlist contract.
 *
 * @param value - URL to validate.
 * @returns The parsed URL when it is an HTTP(S) URL without credentials.
 */
export const parseAllowedRedirectUrl = (value: string): URL | undefined => {
	try {
		const url = new URL(value)
		if (
			!['http:', 'https:'].includes(url.protocol) ||
			url.username !== '' ||
			url.password !== ''
		) {
			return undefined
		}

		return url
	} catch {
		return undefined
	}
}
