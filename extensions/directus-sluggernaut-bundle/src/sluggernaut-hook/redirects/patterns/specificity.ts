import type { ParsedPattern } from './grammar'

import { sluggernautValidationError } from '../../../shared/errors'
import { validatePatternRedirect } from './parser'
import { createPatternSignature } from './signature'

/** Maximum number of route segments that can be represented in the 64-bit score. */
export const PATTERN_SPECIFICITY_SEGMENT_LIMIT = 20

const RADIX = 8n
const END = 4n

/**
 * Maps a route segment to its precedence digit.
 * @param pattern - Parsed route segment.
 * @returns Three-bit precedence rank.
 */
function segmentRank(pattern: ParsedPattern['segments'][number]): bigint {
	if (pattern.kind === 'static') return 7n
	if (pattern.kind === 'parameter') {
		if (pattern.optional) return 3n
		return pattern.suffix === '' ? 5n : 6n
	}
	return pattern.optional ? 1n : 2n
}

/**
 * Encodes route precedence as a fixed-width base-eight 64-bit-compatible decimal string.
 *
 * Each route slot uses three bits. Static segments rank above required parameters, which rank
 * above the conceptual end marker, followed by optional parameters and wildcards. Padding with
 * the end marker makes numeric comparison equivalent to left-to-right lexicographic comparison.
 * Twenty slots use 60 bits, leaving four bits unused in the 64-bit database value.
 * @param pattern - Parsed pattern origin.
 * @returns Decimal string containing the persisted specificity value.
 */
export function createPatternSpecificity(pattern: ParsedPattern): string {
	if (pattern.segments.length > PATTERN_SPECIFICITY_SEGMENT_LIMIT) {
		throw sluggernautValidationError(
			`Pattern origins may contain at most ${PATTERN_SPECIFICITY_SEGMENT_LIMIT} segments.`,
		)
	}

	let encoded = 0n
	for (let index = 0; index < PATTERN_SPECIFICITY_SEGMENT_LIMIT; index += 1) {
		const segment = pattern.segments[index]
		const rank = segment === undefined ? END : segmentRank(segment)
		encoded = encoded * RADIX + rank
	}
	return encoded.toString(10)
}

/** Derived metadata persisted for a valid pattern redirect. */
export interface PatternMetadata {
	origin: string
	destination: string
	matcher_signature: string
	specificity: string
}

/**
 * Parses a pattern redirect and derives all system-owned pattern metadata.
 * @param origin - Candidate pattern origin.
 * @param destination - Candidate destination template.
 * @returns Normalized paths and derived matcher metadata.
 */
export function derivePatternMetadata(origin: string, destination: string): PatternMetadata {
	const parsed = validatePatternRedirect(origin, destination)
	return {
		origin: parsed.origin.normalized,
		destination: parsed.destination.normalized,
		matcher_signature: createPatternSignature(parsed.origin),
		specificity: createPatternSpecificity(parsed.origin),
	}
}
