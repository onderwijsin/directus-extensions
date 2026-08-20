import type { SlugInterfaceOptions, PermalinkInterfaceOptions } from './interface-options.schema'

export interface SluggernautFieldMetadata {
	field: string
	meta?: {
		interface?: string | null
		sort?: number | null
		options?: unknown
	}
}

export interface DiscoveredSlugField {
	field: string
	sort: number | null
	options: SlugInterfaceOptions
}

export interface DiscoveredPermalinkField {
	field: string
	sort: number | null
	options: PermalinkInterfaceOptions
}

export interface ConfigurationWarning {
	field?: string
	code:
		| 'duplicate-slug-interface'
		| 'duplicate-permalink-interface'
		| 'invalid-interface-options'
		| 'invalid-slug-reference'
	message: string
}

export interface CollectionConfiguration {
	slugs: DiscoveredSlugField[]
	permalinks: DiscoveredPermalinkField[]
	warnings: ConfigurationWarning[]
}
