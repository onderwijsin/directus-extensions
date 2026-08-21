import type { Locale } from './locales'

/** Options persisted by the Sluggernaut slug interface. */
export interface SlugInterfaceOptions {
	sourceFields: string[]
	locale: Locale
	lowercase: boolean
	updateOnSourceChange: boolean
	automaticRedirects: boolean
	includeUnmanagedRedirectsInPlanning?: boolean
	unmanagedRedirectConflictBehavior?: 'block' | 'override'
}

/** Options persisted by the Sluggernaut permalink interface. */
export interface PermalinkInterfaceOptions {
	generateFromSlug: boolean
	slugField?: string
	updateOnSlugChange: boolean
	prefix?: string
	validatePrefixOnManualInput: boolean
	trailingSlash: boolean
	enforceTrailingSlashOnManualInput: boolean
	automaticRedirects: boolean
	includeUnmanagedRedirectsInPlanning?: boolean
	unmanagedRedirectConflictBehavior?: 'block' | 'override'
}

/** Directus field metadata consumed by Sluggernaut configuration discovery. */
export interface SluggernautFieldMetadata {
	field: string
	meta?: {
		interface?: string | null
		sort?: number | null
		options?: Record<string, unknown> | null
	} | null
	schema?: { is_primary_key?: boolean } | null
}

/** A validated slug field and its deterministic Directus order. */
export interface DiscoveredSlugField {
	field: string
	sort: number | null
	options: SlugInterfaceOptions
}

/** A validated permalink field and its deterministic Directus order. */
export interface DiscoveredPermalinkField {
	field: string
	sort: number | null
	options: PermalinkInterfaceOptions
}

/** Non-fatal configuration issue reported while discovering fields. */
export interface ConfigurationWarning {
	field?: string
	code:
		| 'duplicate-slug-interface'
		| 'duplicate-permalink-interface'
		| 'invalid-interface-options'
		| 'invalid-source-reference'
		| 'invalid-slug-reference'
	message: string
}

/** All valid derived fields and warnings discovered for one collection. */
export interface CollectionConfiguration {
	slugs: DiscoveredSlugField[]
	permalinks: DiscoveredPermalinkField[]
	warnings: ConfigurationWarning[]
}
