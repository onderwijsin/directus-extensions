import type {
	ParsedPattern,
	PatternParameterSegment,
	PatternSegment,
	PatternStaticSegment,
	PatternWildcardSegment,
} from './grammar'

import { sluggernautValidationError } from '../../../shared/errors'

const PARAMETER_NAME = /^[A-Za-z][A-Za-z0-9_]*$/u
const UNSAFE_PATH = /[\s\\#]/u
const ENCODED_DOT_SEGMENT = /%2e/iu

/**
 * Throws a consistent public parser error.
 * @param message - Human-readable validation message.
 * @returns Never; always throws.
 */
function syntax(message: string): never {
	throw sluggernautValidationError(message)
}

/**
 * Validates common path-level safety rules and normalizes repeated slashes.
 * @param value - Candidate path.
 * @returns Normalized path and its raw segments.
 */
function normalizePath(value: string): {
	path: string
	trailingSlash: boolean
	segments: string[]
} {
	if (!value.startsWith('/')) syntax('A redirect pattern must be an absolute path.')
	if (UNSAFE_PATH.test(value))
		syntax('A redirect pattern must not contain whitespace or URL delimiters.')
	// Control characters are checked by code unit so validation does not depend on Unicode
	// grapheme segmentation; they are never valid in a route path.
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index)
		if ((code >= 0 && code <= 31) || code === 127)
			syntax('A redirect pattern must not contain control characters.')
	}
	if (ENCODED_DOT_SEGMENT.test(value))
		syntax('A redirect pattern must not contain encoded dot segments.')

	// Empty segments are discarded to match exact-path normalization, while this separate flag
	// preserves whether the caller explicitly supplied a trailing slash.
	const trailingSlash = value.length > 1 && value.endsWith('/')
	const segments = value.split('/').filter(Boolean)
	if (segments.some((segment) => segment === '.' || segment === '..'))
		syntax('A redirect pattern must not contain dot segments.')

	return {
		path: `/${segments.join('/')}${trailingSlash ? '/' : ''}`,
		trailingSlash,
		segments,
	}
}

/**
 * Parses one restricted-grammar path segment.
 * @param segment - Segment text without slash separators.
 * @param parameterNames - Names already declared in the path.
 * @param state - Mutable wildcard tracking state.
 * @returns Parsed segment.
 */
function parseSegment(
	segment: string,
	parameterNames: Set<string>,
	state: { wildcard: PatternWildcardSegment | null },
): PatternSegment {
	// Wildcards are whole segments, so accepting them here prevents partial-segment matching.
	if (segment === '*' || segment === '*?') {
		if (state.wildcard !== null) syntax('A redirect pattern may contain at most one wildcard.')
		state.wildcard = { kind: 'wildcard', optional: segment === '*?' }
		return state.wildcard
	}

	if (!segment.startsWith(':')) {
		// Anything that resembles pattern syntax but is not one of the supported forms is rejected
		// instead of being silently treated as a literal route segment.
		if (
			segment.includes(':') ||
			segment.includes('*') ||
			segment.includes('?') ||
			segment.includes('(') ||
			segment.includes(')')
		)
			syntax(`Unsupported pattern syntax in segment "${segment}".`)
		return { kind: 'static', value: segment } satisfies PatternStaticSegment
	}

	// Parse the name, optional marker, and literal suffix separately. The name grammar is kept
	// narrow so regex-like constructs cannot enter the public pattern language accidentally.
	const match = /^:([A-Za-z][A-Za-z0-9_]*)(\?)?([^?]*)$/u.exec(segment)
	if (match === null) syntax(`Malformed named parameter segment "${segment}".`)
	const [, name, optionalMarker, suffix] = match
	if (!name || !PARAMETER_NAME.test(name)) syntax(`Invalid parameter name "${name ?? ''}".`)
	if (optionalMarker && suffix) syntax('Optional parameters cannot have a static suffix.')
	if (/[()*+?[\]|:{}]/u.test(suffix ?? ''))
		syntax(`Unsupported pattern syntax in segment "${segment}".`)
	// Names are stored while parsing so duplicate captures are rejected before a matcher or
	// destination template could interpret them ambiguously.
	if (parameterNames.has(name)) syntax(`Parameter "${name}" is declared more than once.`)
	parameterNames.add(name)
	return {
		kind: 'parameter',
		name,
		optional: optionalMarker === '?',
		suffix: suffix ?? '',
	} satisfies PatternParameterSegment
}

/**
 * Parses a path and optionally requires pattern semantics.
 * @param value - Candidate path.
 * @param requireDynamic - Whether at least one capture is required.
 * @returns Parsed path structure.
 */
function parsePath(value: string, requireDynamic: boolean): ParsedPattern {
	const normalized = normalizePath(value)
	const parameterNames = new Set<string>()
	const state: { wildcard: PatternWildcardSegment | null } = { wildcard: null }
	// Parse every segment in order while sharing capture state across the complete path.
	const segments = normalized.segments.map((segment) =>
		parseSegment(segment, parameterNames, state),
	)
	const parameters = new Map<string, PatternParameterSegment>()
	// Keep named captures indexed for constant-time destination-reference validation.
	for (const segment of segments)
		if (segment.kind === 'parameter') parameters.set(segment.name, segment)
	const isPattern = parameters.size > 0 || state.wildcard !== null
	// Static paths belong to the exact matcher; only origins require at least one dynamic token.
	if (requireDynamic && !isPattern)
		syntax('A pattern origin must contain at least one dynamic token.')
	return {
		segments,
		trailingSlash: normalized.trailingSlash,
		parameters,
		wildcard: state.wildcard,
		isPattern,
		normalized: normalized.path,
	}
}

/**
 * Parses a pattern origin using only Sluggernaut's supported public grammar.
 * @param value - Candidate pattern origin.
 * @returns Parsed pattern structure.
 */
export function parsePatternOrigin(value: string): ParsedPattern {
	return parsePath(value, true)
}

/**
 * Parses a path-only destination template without requiring dynamic tokens.
 * @param value - Candidate destination template.
 * @returns Parsed destination structure.
 */
export function parseDestinationTemplate(value: string): ParsedPattern {
	return parsePath(value, false)
}

/**
 * Validates that a destination template is safely backed by an origin's captures.
 * @param origin - Parsed pattern origin.
 * @param destination - Parsed destination template.
 * @returns Nothing; throws when interpolation is unsafe.
 */
export function validatePatternDestination(
	origin: ParsedPattern,
	destination: ParsedPattern,
): void {
	for (const segment of destination.segments) {
		if (segment.kind === 'parameter') {
			// A destination parameter must refer to a capture from the origin. Optional source
			// captures must remain optional, otherwise rendering could produce an empty segment.
			const source = origin.parameters.get(segment.name)
			if (!source) syntax(`Destination references unknown parameter "${segment.name}".`)
			if (source.optional && !segment.optional)
				syntax(
					`Optional parameter "${segment.name}" must remain optional in the destination.`,
				)
		}
		if (segment.kind === 'wildcard') {
			// Apply the same guarantee to wildcard interpolation: an optional source cannot satisfy
			// a required destination segment.
			if (origin.wildcard === null)
				syntax('Destination references a wildcard that the origin does not capture.')
			if (origin.wildcard.optional && !segment.optional)
				syntax('An optional origin wildcard must remain optional in the destination.')
		}
	}
}

/**
 * Parses and validates a complete pattern redirect definition.
 * @param origin - Candidate pattern origin.
 * @param destination - Candidate destination template.
 * @returns Parsed and validated redirect paths.
 */
export function validatePatternRedirect(
	origin: string,
	destination: string,
): {
	origin: ParsedPattern
	destination: ParsedPattern
} {
	// Keep parsing and validation in one entry point so callers cannot persist an origin and
	// destination that were validated against different interpretations of the grammar.
	const parsedOrigin = parsePatternOrigin(origin)
	const parsedDestination = parseDestinationTemplate(destination)
	validatePatternDestination(parsedOrigin, parsedDestination)
	return { origin: parsedOrigin, destination: parsedDestination }
}
