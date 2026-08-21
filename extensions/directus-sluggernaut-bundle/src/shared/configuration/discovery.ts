/**
 * @fileoverview Discovers, validates, warns about, and orders configured fields.
 *
 * Discovers the usable Sluggernaut configuration from Directus field metadata.
 *
 * Interface options are owned by the Sluggernaut interfaces and are read using their declared
 * types. Missing or mismatched options are excluded and returned as warnings, allowing unrelated
 * fields in the same collection to continue working. Valid fields are sorted by Directus field
 * order with a name tie-breaker.
 */
import type {
	CollectionConfiguration,
	ConfigurationWarning,
	DiscoveredPermalinkField,
	DiscoveredSlugField,
	PermalinkInterfaceOptions,
	SluggernautFieldMetadata,
	SlugInterfaceOptions,
} from './types'

import {
	isArray,
	isBoolean,
	isFiniteNumber,
	isString,
	isDefined,
} from '@onderwijsin/directus-extension-utils'

import { INTERFACE_IDS } from './constants'

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
 * Creates a warning for missing or mismatched interface options.
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

interface FieldDiscoveryResult<T> {
	value: T | null
	warning?: ConfigurationWarning
}

/**
 * Narrows raw Directus options to the options owned by the slug interface.
 * @param options - Raw options read from Directus field metadata.
 * @returns Whether the options have the slug interface shape.
 */
function isSlugInterfaceOptions(
	options: Record<string, unknown>,
): options is SlugInterfaceOptions & Record<string, unknown> {
	return (
		isArray(options.sourceFields) &&
		isString(options.locale) &&
		isBoolean(options.lowercase) &&
		isBoolean(options.updateOnSourceChange) &&
		isBoolean(options.automaticRedirects)
	)
}

/**
 * Narrows raw Directus options to the options owned by the permalink interface.
 * @param options - Raw options read from Directus field metadata.
 * @returns Whether the options have the permalink interface shape.
 */
function isPermalinkInterfaceOptions(
	options: Record<string, unknown>,
): options is PermalinkInterfaceOptions & Record<string, unknown> {
	return (
		isBoolean(options.generateFromSlug) &&
		(!isDefined(options.slugField) || isString(options.slugField)) &&
		isBoolean(options.updateOnSlugChange) &&
		(!isDefined(options.prefix) || isString(options.prefix)) &&
		isBoolean(options.validatePrefixOnManualInput) &&
		isBoolean(options.trailingSlash) &&
		isBoolean(options.enforceTrailingSlashOnManualInput) &&
		isBoolean(options.automaticRedirects)
	)
}

/**
 * Reads one Sluggernaut slug field and validates its source references.
 * @param field - Directus field metadata.
 * @param sort - Deterministic field order.
 * @param availableFields - Fields available in the collection.
 * @returns The discovered field or its configuration warning.
 */
function parseSlugField(
	field: SluggernautFieldMetadata,
	sort: number | null,
	availableFields: ReadonlySet<string>,
): FieldDiscoveryResult<DiscoveredSlugField> {
	const options = field.meta?.options
	if (options === undefined || options === null || !isSlugInterfaceOptions(options)) {
		return { value: null, warning: warningForInvalidOptions(field.field, 'slug') }
	}

	const missingSourceField = options.sourceFields.find(
		(sourceField) => !availableFields.has(sourceField),
	)
	if (missingSourceField !== undefined) {
		return {
			value: null,
			warning: {
				field: field.field,
				code: 'invalid-source-reference',
				message: `Slug field "${field.field}" references missing source field "${missingSourceField}".`,
			},
		}
	}

	return { value: { field: field.field, sort, options } }
}

/**
 * Reads one Sluggernaut permalink field.
 * @param field - Directus field metadata.
 * @param sort - Deterministic field order.
 * @returns The discovered field or its configuration warning.
 */
function parsePermalinkField(
	field: SluggernautFieldMetadata,
	sort: number | null,
): FieldDiscoveryResult<DiscoveredPermalinkField> {
	const options = field.meta?.options
	if (!isDefined(options) || options === null || !isPermalinkInterfaceOptions(options)) {
		return { value: null, warning: warningForInvalidOptions(field.field, 'permalink') }
	}
	return { value: { field: field.field, sort, options } }
}

/**
 * Discovers Sluggernaut field configuration from Directus field metadata.
 *
 * Invalid interface options are reported as warnings and excluded from runtime configuration so
 * callers can keep unrelated content mutations working.
 * @param fields - Directus field metadata for one collection.
 * @returns Deterministically ordered configuration.
 */
export function discoverCollectionConfiguration(
	fields: readonly SluggernautFieldMetadata[],
): CollectionConfiguration {
	const slugs: DiscoveredSlugField[] = []
	const permalinks: DiscoveredPermalinkField[] = []
	const warnings: ConfigurationWarning[] = []
	const availableFields = new Set(fields.map((value) => value.field))

	for (const field of fields) {
		const interfaceId = field.meta?.interface
		const sort = isFiniteNumber(field.meta?.sort) ? field.meta.sort : null

		switch (interfaceId) {
			case INTERFACE_IDS.slug: {
				const result = parseSlugField(field, sort, availableFields)
				if (result.warning !== undefined) warnings.push(result.warning)
				if (result.value !== null) slugs.push(result.value)
				break
			}
			case INTERFACE_IDS.permalink: {
				const result = parsePermalinkField(field, sort)
				if (result.warning !== undefined) warnings.push(result.warning)
				if (result.value !== null) permalinks.push(result.value)
				break
			}
		}
	}

	slugs.sort(compareFieldOrder)

	// A generated permalink is only safe when its configured slug dependency survived validation.
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
