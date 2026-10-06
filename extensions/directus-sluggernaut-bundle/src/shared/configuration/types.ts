import type { Locale } from './locales'
import type { PathTemplateVariable } from './path-template.schema'

/** Redirect planning options shared by both Sluggernaut field interfaces. */
export interface RedirectInterfaceOptions {
	automaticRedirects: boolean
	includeUnmanagedRedirectsInPlanning?: boolean
	unmanagedRedirectConflictBehavior?: 'block' | 'override'
}

/** Options persisted by the Sluggernaut slug interface. */
export interface SlugInterfaceOptions extends RedirectInterfaceOptions {
	sourceFields: string[]
	locale: Locale
	lowercase: boolean
	updateOnSourceChange: boolean
}

/** Options persisted by the Sluggernaut permalink interface. */
export interface PermalinkInterfaceOptions extends RedirectInterfaceOptions {
	generateFromTemplate: boolean
	pathTemplate?: string
	templateVariables?: PathTemplateVariable[]
	updateOnDependencyChange: boolean
	trailingSlash: boolean
	enforceTrailingSlashOnManualInput: boolean
}

/** Directus field metadata consumed by Sluggernaut configuration discovery. */
export interface SluggernautFieldMetadata {
	field: string
	type?: string
	meta?: {
		special?: string[] | null
		interface?: string | null
		sort?: number | null
		options?: Record<string, unknown> | null
	} | null
	schema?: {
		is_primary_key?: boolean
		foreign_key_table?: string | null
		default_value?: unknown
	} | null
}

/** A validated slug field and its deterministic Directus order. */
export interface DiscoveredSlugField {
	field: string
	sort: number | null
	options: SlugInterfaceOptions
}

/** A validated permalink field and its deterministic Directus order. */
export interface DiscoveredPermalinkField {
	/** Literal dependency defaults used only when creating an item. */
	dependencyDefaults?: Readonly<Record<string, string | number | boolean>>
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
		| 'invalid-template-reference'
	message: string
}

/** All valid derived fields and warnings discovered for one collection. */
export interface CollectionConfiguration {
	slugs: DiscoveredSlugField[]
	permalinks: DiscoveredPermalinkField[]
	warnings: ConfigurationWarning[]
}
