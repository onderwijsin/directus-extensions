/** A supported named parameter in a redirect pattern. */
export interface PatternParameterSegment {
	kind: 'parameter'
	name: string
	optional: boolean
	suffix: string
}

/** A supported wildcard segment in a redirect pattern. */
export interface PatternWildcardSegment {
	kind: 'wildcard'
	optional: boolean
}

/** A literal path segment in a redirect pattern. */
export interface PatternStaticSegment {
	kind: 'static'
	value: string
}

/** A segment accepted by the restricted redirect pattern grammar. */
export type PatternSegment = PatternStaticSegment | PatternParameterSegment | PatternWildcardSegment

/** A parsed redirect pattern or path template. */
export interface ParsedPattern {
	segments: readonly PatternSegment[]
	trailingSlash: boolean
	parameters: ReadonlyMap<string, PatternParameterSegment>
	wildcard: PatternWildcardSegment | null
	isPattern: boolean
	normalized: string
}

/** Error raised when a path does not satisfy the public redirect pattern grammar. */
export class PatternSyntaxError extends Error {
	public readonly code = 'PATTERN_SYNTAX_ERROR'

	/**
	 *
	 */
	public constructor(message: string) {
		super(message)
		this.name = 'PatternSyntaxError'
	}
}
