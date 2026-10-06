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
	RedirectInterfaceOptions,
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
import { z } from 'zod'

import { compilePathTemplate } from '../values/path-template'
import { INTERFACE_IDS } from './constants'
import { isLiteralDependencyDefault } from './dependency-defaults'
import { pathTemplateVariableSchema } from './path-template.schema'

const redirectInterfaceDefaults: Required<RedirectInterfaceOptions> = {
	automaticRedirects: false,
	includeUnmanagedRedirectsInPlanning: true,
	unmanagedRedirectConflictBehavior: 'override',
}

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
		isBoolean(options.automaticRedirects) &&
		(!isDefined(options.includeUnmanagedRedirectsInPlanning) ||
			isBoolean(options.includeUnmanagedRedirectsInPlanning)) &&
		(!isDefined(options.unmanagedRedirectConflictBehavior) ||
			options.unmanagedRedirectConflictBehavior === 'block' ||
			options.unmanagedRedirectConflictBehavior === 'override')
	)
}

/** Shared permalink options remain validated in generated and standalone modes. */
const sharedPermalinkOptionsSchema = z.object({
	trailingSlash: z.boolean().default(false),
	enforceTrailingSlashOnManualInput: z.boolean().default(false),
	automaticRedirects: z.boolean().default(false),
	includeUnmanagedRedirectsInPlanning: z.boolean().default(true),
	unmanagedRedirectConflictBehavior: z.enum(['block', 'override']).default('override'),
})

/** Hidden template-only settings are ignored while generation is explicitly disabled. */
const permalinkOptionsSchema = z.union([
	sharedPermalinkOptionsSchema
		.extend({ generateFromTemplate: z.literal(false) })
		.transform((options) => ({ ...options, updateOnDependencyChange: false })),
	sharedPermalinkOptionsSchema.extend({
		generateFromTemplate: z.literal(true).default(true),
		pathTemplate: z
			.string()
			.nullish()
			.transform((value) => value ?? undefined),
		templateVariables: z
			.array(pathTemplateVariableSchema)
			.nullish()
			.transform((value) => value ?? []),
		updateOnDependencyChange: z.boolean().default(false),
	}),
])

/**
 * Applies the defaults declared by the Studio slug interface.
 *
 * Directus persists only options that differ from an interface default in some mutations. The
 * runtime therefore cannot require every optional option to be present in `meta.options`.
 * @param options - Raw options persisted by Directus.
 * @returns Options with the interface defaults restored.
 */
function withSlugInterfaceDefaults(options: Record<string, unknown>): Record<string, unknown> {
	return {
		locale: 'en',
		lowercase: true,
		updateOnSourceChange: true,
		...redirectInterfaceDefaults,
		...options,
	}
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
	const normalizedOptions =
		options === undefined || options === null ? null : withSlugInterfaceDefaults(options)
	if (normalizedOptions === null || !isSlugInterfaceOptions(normalizedOptions)) {
		return { value: null, warning: warningForInvalidOptions(field.field, 'slug') }
	}

	const missingSourceField = normalizedOptions.sourceFields.find(
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

	return {
		value: {
			field: field.field,
			sort,
			options: {
				...normalizedOptions,
				includeUnmanagedRedirectsInPlanning:
					normalizedOptions.includeUnmanagedRedirectsInPlanning,
				unmanagedRedirectConflictBehavior:
					normalizedOptions.unmanagedRedirectConflictBehavior === 'block'
						? 'block'
						: 'override',
			},
		},
	}
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
	const parsed = permalinkOptionsSchema.safeParse(options)
	if (!parsed.success)
		return { value: null, warning: warningForInvalidOptions(field.field, 'permalink') }
	return { value: { field: field.field, sort, options: parsed.data } }
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

	// Only scalar fields in this collection may participate; permalink dependencies would be cyclic.
	const scalarTypes = new Set([
		'string',
		'text',
		'integer',
		'bigInteger',
		'float',
		'decimal',
		'boolean',
		'date',
		'time',
		'dateTime',
		'timestamp',
		'uuid',
	])
	const slugFields = new Set(slugs.map((field) => field.field))
	const validPermalinks = permalinks.filter((permalink) => {
		if (!permalink.options.generateFromTemplate) return true
		try {
			const template = compilePathTemplate(permalink.options)
			const dependencyDefaults: Record<string, string | number | boolean> = {}
			for (const dependency of template.dependencies) {
				const source = fields.find((field) => field.field === dependency)
				if (
					!source ||
					!scalarTypes.has(source.type ?? '') ||
					source.schema?.foreign_key_table ||
					source.meta?.special?.some((special) =>
						['m2o', 'o2m', 'm2m', 'm2a', 'file', 'files', 'translations'].includes(
							special,
						),
					) ||
					source.meta?.interface === INTERFACE_IDS.permalink ||
					(source.meta?.interface === INTERFACE_IDS.slug && !slugFields.has(dependency))
				) {
					throw new Error(
						`Template dependency "${dependency}" must be a valid scalar field in the same collection.`,
					)
				}
				const value = source.schema?.default_value
				if (isLiteralDependencyDefault(value)) {
					dependencyDefaults[dependency] = value
				}
			}
			if (Object.keys(dependencyDefaults).length > 0)
				permalink.dependencyDefaults = dependencyDefaults
			return true
		} catch (error) {
			warnings.push({
				field: permalink.field,
				code: 'invalid-template-reference',
				message: error instanceof Error ? error.message : 'Invalid path template.',
			})
			return false
		}
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
