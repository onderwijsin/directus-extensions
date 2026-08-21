/**
 * @fileoverview Defines the canonical slug, path, prefix, and host normalization rules.
 *
 * These helpers define the canonical representation used by both the mutation coordinator and
 * redirect planner. They reject absolute URLs and unsafe path syntax where the field contract
 * requires a path, while keeping empty values representable as null.
 */
import {
	hasKey,
	isString,
	isDefined,
	isNonBlankString,
} from '@onderwijsin/directus-extension-utils'
import {
	cleanDoubleSlashes,
	joinURL,
	withLeadingSlash,
	withTrailingSlash,
	withoutTrailingSlash,
} from 'ufo'

const COMBINING_MARKS = /\p{M}/gu
const NON_WORD_CHARACTERS = /[^\p{L}\p{N}]+/gu
export interface PathNormalizationOptions {
	/** Whether a non-root path must end with a slash. */
	trailingSlash?: boolean
}

/** Result of validating the optional host configured for the link display. */
export interface HostNormalizationResult {
	host: string
	error: string | null
}

/**
 * Converts a user-facing value to a predictable URL-safe slug.
 * @param value - Value to normalize.
 * @param locale - Locale used for case conversion.
 * @param lowercase - Whether to lowercase the result.
 * @returns A normalized slug or null for an empty value.
 */
export function normalizeSlug(
	value: string | null | undefined,
	locale = 'en',
	lowercase = true,
): string | null {
	if (value === null || !isDefined(value) || !isNonBlankString(value)) return null

	const localeNormalized = lowercase ? value.toLocaleLowerCase(locale) : value
	const normalized = localeNormalized.normalize('NFKD').replace(COMBINING_MARKS, '')
	const slug = normalized
		.replace(NON_WORD_CHARACTERS, '-')
		.replace(/^-+|-+$/gu, '')
		.replace(/-{2,}/gu, '-')

	if (!isNonBlankString(slug)) return null
	return slug
}

/**
 * Resolves the effective value of a field from the payload/item state.
 * @param payload - Incoming mutation payload.
 * @param existingItem - Existing item values.
 * @param field - Field key to resolve.
 * @returns The explicitly supplied value or existing value.
 */
export function resolveEffectiveFieldValue(
	payload: Readonly<Record<string, unknown>>,
	existingItem: Readonly<Record<string, unknown>>,
	field: string,
): unknown {
	return hasKey(payload, field) ? payload[field] : existingItem[field]
}

/**
 * Removes empty permalink source values and combines the remaining values with hyphens.
 * @param values - Candidate source values.
 * @returns Combined permalink source text or null when no source is present.
 */
export function combinePermalinkSourceValues(values: readonly unknown[]): string | null {
	const nonEmptyValues = values.flatMap((value) => {
		if (!isString(value)) return []
		const trimmed = value.trim()
		return trimmed === '' ? [] : [trimmed]
	})

	return nonEmptyValues.length > 0 ? nonEmptyValues.join('-') : null
}

/**
 * Derives a slug from source values.
 * @param sourceValues - Values selected by the interface configuration.
 * @param locale - Locale used for case conversion.
 * @param lowercase - Whether to lowercase the result.
 * @returns A normalized slug or null when all sources are empty.
 */
export function deriveSlug(
	sourceValues: readonly unknown[],
	locale = 'en',
	lowercase = true,
): string | null {
	return normalizeSlug(combinePermalinkSourceValues(sourceValues), locale, lowercase)
}

/**
 * Validates and normalizes an absolute URL path. This intentionally does not accept a host.
 * @param value - Candidate permalink value.
 * @returns A normalized path or null for an empty value.
 */
export function normalizePermalink(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null
	if (!isString(value) || value.trim() === '') return null

	const path = value.trim()
	if (!path.startsWith('/') || path.startsWith('//')) {
		throw new Error('A permalink must be an absolute URL path.')
	}
	if (
		Array.from(path).some((character) => {
			const code = character.codePointAt(0) ?? 0
			return (code >= 0 && code <= 31) || code === 127
		}) ||
		/\s/u.test(path) ||
		path.includes('\\') ||
		path.includes('?') ||
		path.includes('#')
	) {
		throw new Error('A permalink contains a forbidden character.')
	}
	if (/^[a-z][a-z\d+.-]*:/iu.test(path)) {
		throw new Error('A permalink must not contain a URL scheme.')
	}

	const normalized = cleanDoubleSlashes(path)
	// Dot segments are rejected after slash collapsing so equivalent unsafe paths cannot bypass validation.
	if (normalized.split('/').some((segment) => segment === '.' || segment === '..')) {
		throw new Error('A permalink must not contain dot path segments.')
	}
	return normalized
}

/**
 * Normalizes a configured path prefix.
 * @param prefix - Candidate prefix.
 * @returns A normalized prefix or null when none is configured.
 */
export function normalizePrefix(prefix: string | null | undefined): string | null {
	if (prefix === null || prefix === undefined || prefix.trim() === '') return null
	const normalized = normalizePermalink(withLeadingSlash(prefix))
	if (normalized === null) return null
	if (normalized === '/') return '/'
	return withoutTrailingSlash(normalized)
}

/**
 * Applies a trailing-slash policy to a path.
 * @param value - Candidate path.
 * @param trailingSlash - Whether the result should end with a slash.
 * @returns A normalized path.
 */
export function applyTrailingSlash(value: string, trailingSlash: boolean): string {
	const normalized = normalizePermalink(value)
	if (normalized === null || normalized === '/') return '/'
	return trailingSlash ? withTrailingSlash(normalized) : withoutTrailingSlash(normalized)
}

/**
 * Joins a prefix and slug into a permalink.
 * @param prefix - Optional path prefix.
 * @param slug - Slug value.
 * @param locale - Locale used for transliteration.
 * @param lowercase - Whether the normalized slug should be lowercase.
 * @returns A permalink path.
 */
export function joinPrefixAndSlug(
	prefix: string | null | undefined,
	slug: string,
	locale = 'en',
	lowercase = true,
): string {
	const normalizedSlug = normalizeSlug(slug, locale, lowercase)
	if (normalizedSlug === null) return normalizePrefix(prefix) ?? '/'
	const normalizedPrefix = normalizePrefix(prefix)
	return joinURL(normalizedPrefix ?? '/', normalizedSlug)
}

/**
 * Checks prefix membership using path-segment boundaries.
 * @param value - Candidate permalink.
 * @param prefix - Configured prefix.
 * @returns Whether the value belongs below the prefix.
 */
export function isWithinPrefix(value: string, prefix: string | null | undefined): boolean {
	const normalizedValue = normalizePermalink(value)
	const normalizedPrefix = normalizePrefix(prefix)
	if (normalizedValue === null || normalizedPrefix === null || normalizedPrefix === '/')
		return true
	return (
		normalizedValue === normalizedPrefix || normalizedValue.startsWith(`${normalizedPrefix}/`)
	)
}

/**
 * Normalizes a manually supplied permalink according to interface options.
 * @param value - Candidate manual value.
 * @param options - Prefix and trailing-slash rules.
 * @returns A normalized manual permalink.
 */
export function normalizeManualPermalink(
	value: string | null | undefined,
	options: PathNormalizationOptions & {
		prefix?: string | null
		validatePrefix?: boolean
		enforceTrailingSlash?: boolean
	},
): string | null {
	const normalized = normalizePermalink(value)
	if (normalized === null) return null
	if (options.validatePrefix && !isWithinPrefix(normalized, options.prefix)) {
		throw new Error('The permalink is outside the configured prefix.')
	}
	return options.enforceTrailingSlash
		? applyTrailingSlash(normalized, options.trailingSlash ?? false)
		: normalized
}

/**
 * Validates and normalizes a display host.
 * @param host - Candidate HTTP(S) origin.
 * @returns The normalized host or a validation error.
 */
export function normalizeHost(host: string | null | undefined): HostNormalizationResult {
	if (host === null || host === undefined || host.trim() === '') return { host: '', error: null }
	try {
		const url = new URL(host.trim())
		if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Host must use HTTP(S).')
		if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
			throw new Error('Host must be an HTTP(S) origin without credentials or a base path.')
		}
		return { host: url.origin, error: null }
	} catch (error) {
		return { host: '', error: error instanceof Error ? error.message : 'Invalid host.' }
	}
}
