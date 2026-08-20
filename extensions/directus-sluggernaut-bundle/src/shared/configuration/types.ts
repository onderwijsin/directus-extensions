import type { SlugInterfaceOptions, PermalinkInterfaceOptions } from './interface-options.schema'

export type { SluggernautFieldMetadata } from './field-metadata.schema'

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
