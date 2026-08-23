import type { ParsedPattern } from './grammar'

/**
 * Returns a stable signature that ignores parameter names but preserves route structure.
 * @param pattern - Parsed pattern origin.
 * @returns Stable matcher signature.
 */
export function createPatternSignature(pattern: ParsedPattern): string {
	return pattern.segments
		.map((segment) => {
			if (segment.kind === 'static') return `s:${segment.value}`
			if (segment.kind === 'wildcard')
				return `w:${segment.optional ? 'optional' : 'required'}`
			return `p:${segment.optional ? 'optional' : 'required'}:${segment.suffix}`
		})
		.concat(pattern.trailingSlash ? ['slash'] : [])
		.join('|')
}
