import { isNonBlankString } from '@onderwijsin/directus-extension-utils'

import { containsControlCharacter, normalizePermalink } from '../../shared/values/normalization'

/** A normalized destination that either continues through the redirect graph or terminates it. */
export type ExactRedirectDestination =
	| { kind: 'path'; value: string }
	| { kind: 'external'; value: string }

const URL_SCHEME = /^[a-z][a-z\d+.-]*:/iu
const HTTP_SCHEME = /^https?:/iu

/** Requires a non-empty redirect string without whitespace or controls.
 * @param value - Candidate value.
 * @param field - Field name for the error.
 * @returns The validated string.
 */
function requireString(value: unknown, field: string): string {
	if (!isNonBlankString(value)) {
		throw new Error(`A redirect ${field} must be a non-empty string.`)
	}
	if (/\s/u.test(value) || containsControlCharacter(value)) {
		throw new Error(`A redirect ${field} contains whitespace or a control character.`)
	}
	return value
}

/** Normalizes an exact redirect origin as a path and rejects exact-pattern syntax.
 * @param value - Raw origin.
 * @returns Normalized path.
 */
export function normalizeExactRedirectOrigin(value: unknown): string {
	const input = requireString(value, 'origin')
	if (input.includes(':') || input.includes('*')) {
		throw new Error('An exact redirect origin must not contain pattern syntax.')
	}
	return normalizePermalink(input) ?? '/'
}

/** Classifies and validates an exact redirect destination.
 * @param value - Raw destination.
 * @returns Classified normalized destination.
 */
export function normalizeExactRedirectDestination(value: unknown): ExactRedirectDestination {
	const input = requireString(value, 'destination')
	if (input.startsWith('//')) {
		throw new Error('A redirect destination must not be protocol-relative.')
	}

	if (URL_SCHEME.test(input)) {
		if (!HTTP_SCHEME.test(input)) {
			throw new Error('External redirect destinations must use http or https.')
		}
		if (!/^https?:\/\//iu.test(input)) {
			throw new Error('An external redirect destination must be an absolute URL with a host.')
		}
		try {
			const parsed = new URL(input)
			if (!parsed.hostname) throw new Error('missing host')
		} catch {
			throw new Error('An external redirect destination must be a valid absolute URL.')
		}
		return { kind: 'external', value: input }
	}

	return { kind: 'path', value: normalizePermalink(input) ?? '/' }
}
