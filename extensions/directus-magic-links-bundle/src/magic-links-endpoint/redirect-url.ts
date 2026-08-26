/**
 * Parses a redirect URL accepted by the magic-link allowlist contract.
 *
 * @param value - URL to validate.
 * @returns The parsed URL when it is an HTTPS URL without credentials or an explicit port.
 */
export const parseAllowedRedirectUrl = (value: string): URL | undefined => {
	try {
		const url = new URL(value)
		if (
			url.protocol !== 'https:' ||
			url.username !== '' ||
			url.password !== '' ||
			url.port !== ''
		) {
			return undefined
		}

		return url
	} catch {
		return undefined
	}
}
