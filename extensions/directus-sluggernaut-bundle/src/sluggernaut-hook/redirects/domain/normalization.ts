import { isNonBlankString } from '@onderwijsin/directus-extension-utils'
import { withoutTrailingSlash } from 'ufo'

import { sluggernautValidationError } from '../../../shared/errors'
import { containsControlCharacter, normalizePermalink } from '../../../shared/values/normalization'

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
		throw sluggernautValidationError(`A redirect ${field} must be a non-empty string.`)
	}
	if (/\s/u.test(value) || containsControlCharacter(value)) {
		throw sluggernautValidationError(
			`A redirect ${field} contains whitespace or a control character.`,
		)
	}
	return value
}

/** Normalizes an exact redirect origin as a literal path.
 * @param value - Raw origin.
 * @returns Normalized path.
 */
export function normalizeExactRedirectOrigin(value: unknown): string {
	const input = requireString(value, 'origin')
	return normalizePermalink(input) ?? '/'
}

/** Returns the identity representation used when comparing exact redirect paths.
 * @param value - Normalized or raw path.
 * @returns Slash-insensitive path identity.
 */
export function compareExactRedirectPath(value: string): string {
	const normalized = normalizePermalink(value) ?? '/'
	return normalized === '/' ? '/' : withoutTrailingSlash(normalized)
}

/** Classifies and validates an exact redirect destination.
 * @param value - Raw destination.
 * @returns Classified normalized destination.
 */
export function normalizeExactRedirectDestination(value: unknown): ExactRedirectDestination {
	const input = requireString(value, 'destination')
	if (input.startsWith('//')) {
		throw sluggernautValidationError('A redirect destination must not be protocol-relative.')
	}

	if (URL_SCHEME.test(input)) {
		if (!HTTP_SCHEME.test(input)) {
			throw sluggernautValidationError(
				'External redirect destinations must use http or https.',
			)
		}
		if (!/^https?:\/\//iu.test(input)) {
			throw sluggernautValidationError(
				'An external redirect destination must be an absolute URL with a host.',
			)
		}
		let parsed: URL
		try {
			parsed = new URL(input)
		} catch {
			throw sluggernautValidationError(
				'An external redirect destination must be a valid absolute URL.',
			)
		}
		if (!parsed.hostname)
			throw sluggernautValidationError('An external redirect destination is missing a host.')
		if (parsed.username !== '' || parsed.password !== '') {
			throw sluggernautValidationError(
				'External redirect destinations must not contain URL credentials.',
			)
		}
		return { kind: 'external', value: input }
	}

	return { kind: 'path', value: normalizePermalink(input) ?? '/' }
}

/** Returns the identity representation used when comparing an exact redirect destination.
 * @param value - Raw destination.
 * @returns Classified destination with a slash-insensitive path value.
 */
export function compareExactRedirectDestination(value: unknown): ExactRedirectDestination {
	const destination = normalizeExactRedirectDestination(value)
	return destination.kind === 'path'
		? { kind: 'path', value: compareExactRedirectPath(destination.value) }
		: destination
}
