import type {
	CollectionConfiguration,
	ConfigurationWarning,
	DiscoveredPermalinkField,
	DiscoveredSlugField,
	SluggernautFieldMetadata,
} from './types'

import { INTERFACE_IDS } from './constants'

/**
 * Narrows an untrusted Directus field record.
 * @param value - Unknown field metadata.
 * @returns Whether the value has the minimum field shape.
 */
function isFieldMetadata(value: unknown): value is SluggernautFieldMetadata {
	if (typeof value !== 'object' || value === null || !('field' in value)) return false
	if (typeof value.field !== 'string') return false
	if (!('meta' in value) || value.meta === undefined || value.meta === null) return true
	return typeof value.meta === 'object' && value.meta !== null
}
import {
	permalinkInterfaceOptionsSchema,
	slugInterfaceOptionsSchema,
} from './interface-options.schema'

/**
 * Compares field metadata using the deterministic Sluggernaut ordering.
 * @param left - First field metadata.
 * @param right - Second field metadata.
 * @returns A sort comparator result.
 */
function compareFieldOrder(
	left: { field: string; sort: number | null },
	right: { field: string; sort: number | null },
): number {
	if (left.sort === null && right.sort !== null) return 1
	if (left.sort !== null && right.sort === null) return -1
	if (left.sort !== null && right.sort !== null && left.sort !== right.sort) {
		return left.sort - right.sort
	}
	return left.field < right.field ? -1 : left.field > right.field ? 1 : 0
}

/**
 * Creates a warning for invalid persisted interface options.
 * @param field - Field key.
 * @param type - Interface type.
 * @returns A structured configuration warning.
 */
function warningForInvalidOptions(field: string, type: string): ConfigurationWarning {
	return {
		field,
		code: 'invalid-interface-options',
		message: `Invalid ${type} interface options on field "${field}".`,
	}
}

/**
 * Discovers and validates Sluggernaut field configuration from Directus field metadata.
 *
 * Invalid interface options are reported as warnings and excluded from runtime configuration so
 * callers can keep unrelated content mutations working.
 * @param fields - Directus field metadata for one collection.
 * @returns Parsed and deterministically ordered configuration.
 */
export function discoverCollectionConfiguration(
	fields: readonly unknown[],
): CollectionConfiguration {
	const slugs: DiscoveredSlugField[] = []
	const permalinks: DiscoveredPermalinkField[] = []
	const warnings: ConfigurationWarning[] = []

	for (const value of fields) {
		if (!isFieldMetadata(value)) continue
		const field = value
		const interfaceId = field.meta?.interface
		const sort = field.meta?.sort ?? null

		if (interfaceId === INTERFACE_IDS.slug) {
			const parsed = slugInterfaceOptionsSchema.safeParse(field.meta?.options ?? {})
			if (!parsed.success) {
				warnings.push(warningForInvalidOptions(field.field, 'slug'))
				continue
			}
			slugs.push({ field: field.field, sort, options: parsed.data })
		}

		if (interfaceId === INTERFACE_IDS.permalink) {
			const parsed = permalinkInterfaceOptionsSchema.safeParse(field.meta?.options ?? {})
			if (!parsed.success) {
				warnings.push(warningForInvalidOptions(field.field, 'permalink'))
				continue
			}
			permalinks.push({ field: field.field, sort, options: parsed.data })
		}
	}

	slugs.sort(compareFieldOrder)

	const slugFields = new Set(slugs.map((field) => field.field))
	const validPermalinks = permalinks.filter((permalink) => {
		if (!permalink.options.generateFromSlug) return true
		if (permalink.options.slugField && slugFields.has(permalink.options.slugField)) return true

		warnings.push({
			field: permalink.field,
			code: 'invalid-slug-reference',
			message: `Permalink field "${permalink.field}" must reference a Sluggernaut slug field in the same collection.`,
		})
		return false
	})
	validPermalinks.sort(compareFieldOrder)

	if (slugs.length > 1) {
		warnings.push({
			code: 'duplicate-slug-interface',
			message:
				'Multiple Sluggernaut slug interfaces were discovered. Derivation is supported, but only the first participates in automatic redirects.',
		})
	}
	if (validPermalinks.length > 1) {
		warnings.push({
			code: 'duplicate-permalink-interface',
			message:
				'Multiple Sluggernaut permalink interfaces were discovered. Derivation is supported, but only the first participates in automatic redirects.',
		})
	}

	return { slugs, permalinks: validPermalinks, warnings }
}

/**
 * Returns the deterministic first slug field.
 * @param configuration - Parsed collection configuration.
 * @returns The first slug field or null.
 */
export function firstSlugField(configuration: CollectionConfiguration): DiscoveredSlugField | null {
	return configuration.slugs[0] ?? null
}

/**
 * Returns the deterministic first permalink field.
 * @param configuration - Parsed collection configuration.
 * @returns The first permalink field or null.
 */
export function firstPermalinkField(
	configuration: CollectionConfiguration,
): DiscoveredPermalinkField | null {
	return configuration.permalinks[0] ?? null
}
