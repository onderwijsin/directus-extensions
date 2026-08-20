import type {
	CollectionConfiguration,
	DiscoveredPermalinkField,
	DiscoveredSlugField,
} from '../shared/types'

import {
	applyTrailingSlash,
	deriveSlug,
	normalizeManualPermalink,
	joinPrefixAndSlug,
	normalizeSlug,
	resolveFinalValue,
} from '../shared/normalization'

export type MutationKind = 'create' | 'update' | 'recalculate'

export interface MutationCoordinatorInput {
	kind: MutationKind
	payload: Readonly<Record<string, unknown>>
	existingItem: Readonly<Record<string, unknown>>
	configuration: CollectionConfiguration
	/** Fields to recalculate; omitted means all configured fields. */
	fieldKeys?: ReadonlySet<string>
}

export interface MutationCoordinatorResult {
	payload: Record<string, unknown>
	changedSlugFields: string[]
	changedPermalinkFields: string[]
}

/**
 * Checks whether a payload contains any field from a configured set.
 * @param payload - Incoming mutation payload.
 * @param fields - Field keys to inspect.
 * @returns Whether at least one field is present.
 */
function hasAnyField(payload: Readonly<Record<string, unknown>>, fields: readonly string[]) {
	return fields.some((field) => Object.hasOwn(payload, field))
}

/**
 * Resolves all configured slug source values against the final item state.
 * @param payload - Incoming mutation payload.
 * @param existingItem - Existing item values.
 * @param field - Slug field configuration.
 * @returns Resolved source values.
 */
function sourceValues(
	payload: Readonly<Record<string, unknown>>,
	existingItem: Readonly<Record<string, unknown>>,
	field: DiscoveredSlugField,
): unknown[] {
	return field.options.sourceFields.map((sourceField) =>
		resolveFinalValue(payload, existingItem, sourceField),
	)
}

/**
 * Resolves one slug field for a mutation.
 * @param input - Mutation input.
 * @param field - Slug field configuration.
 * @returns Derived value and write decision.
 */
function resolveSlugValue(
	input: MutationCoordinatorInput,
	field: DiscoveredSlugField,
): { value: string | null; shouldWrite: boolean } {
	const explicitlySupplied = Object.hasOwn(input.payload, field.field)
	const sourceChanged = hasAnyField(input.payload, field.options.sourceFields)
	const shouldDerive =
		input.kind === 'create' ||
		input.kind === 'recalculate' ||
		(field.options.updateOnSourceChange && sourceChanged)

	if (explicitlySupplied) {
		const value = input.payload[field.field]
		if (value !== null && value !== undefined && typeof value !== 'string') {
			throw new Error(`Slug field "${field.field}" must receive a string or null value.`)
		}
		return {
			value: normalizeSlug(value, field.options.locale, field.options.lowercase),
			shouldWrite: true,
		}
	}

	if (!shouldDerive) {
		const existingValue = input.existingItem[field.field]
		return {
			value: typeof existingValue === 'string' ? existingValue : null,
			shouldWrite: false,
		}
	}

	return {
		value: deriveSlug(
			sourceValues(input.payload, input.existingItem, field),
			field.options.locale,
			field.options.lowercase,
		),
		shouldWrite: true,
	}
}

/**
 * Resolves the final value of a slug field.
 * @param input - Mutation input.
 * @param field - Slug field configuration.
 * @param derivedValues - Values already derived in this mutation.
 * @returns Final slug value.
 */
function finalSlugValue(
	input: MutationCoordinatorInput,
	field: DiscoveredSlugField,
	derivedValues: ReadonlyMap<string, string | null>,
): string | null {
	if (derivedValues.has(field.field)) return derivedValues.get(field.field) ?? null
	const value = resolveFinalValue(input.payload, input.existingItem, field.field)
	return typeof value === 'string' ? value : null
}

/**
 * Compares a final slug with its stored value.
 * @param input - Mutation input.
 * @param field - Slug field configuration.
 * @param value - Final slug value.
 * @returns Whether the slug changed.
 */
function slugChanged(
	input: MutationCoordinatorInput,
	field: DiscoveredSlugField,
	value: string | null,
): boolean {
	if (input.kind === 'create') return true
	const previous = input.existingItem[field.field]
	return (typeof previous === 'string' ? previous : null) !== value
}

/**
 * Resolves one permalink field after slug derivation.
 * @param input - Mutation input.
 * @param field - Permalink field configuration.
 * @param derivedSlugs - Values derived earlier in this mutation.
 * @returns Derived value and write decision.
 */
function resolvePermalinkValue(
	input: MutationCoordinatorInput,
	field: DiscoveredPermalinkField,
	derivedSlugs: ReadonlyMap<string, string | null>,
): { value: string | null; shouldWrite: boolean } {
	const explicitlySupplied = Object.hasOwn(input.payload, field.field)
	if (explicitlySupplied) {
		const value = input.payload[field.field]
		if (value !== null && value !== undefined && typeof value !== 'string') {
			throw new Error(`Permalink field "${field.field}" must receive a string or null value.`)
		}
		return {
			value: normalizeManualPermalink(value, {
				prefix: field.options.prefix,
				validatePrefix: field.options.validatePrefixOnManualInput,
				trailingSlash: field.options.trailingSlash,
				enforceTrailingSlash: field.options.enforceTrailingSlashOnManualInput,
			}),
			shouldWrite: true,
		}
	}

	if (!field.options.generateFromSlug) return { value: null, shouldWrite: false }
	const slugField = field.options.slugField
	if (!slugField) return { value: null, shouldWrite: false }
	const slug = derivedSlugs.get(slugField)
	const slugConfiguration = input.configuration.slugs.find(
		(candidate) => candidate.field === slugField,
	)
	if (!slugConfiguration) return { value: null, shouldWrite: false }
	const finalSlug = slug ?? finalSlugValue(input, slugConfiguration, derivedSlugs)
	const shouldSynchronize =
		input.kind === 'create' ||
		input.kind === 'recalculate' ||
		(field.options.updateOnSlugChange && slugChanged(input, slugConfiguration, finalSlug))
	if (!shouldSynchronize) return { value: null, shouldWrite: false }
	if (finalSlug === null) return { value: null, shouldWrite: true }

	return {
		value: applyTrailingSlash(
			joinPrefixAndSlug(field.options.prefix, finalSlug),
			field.options.trailingSlash,
		),
		shouldWrite: true,
	}
}

/**
 * Resolves derived slug and permalink values in the required dependency order.
 * @param input - Mutation payload, existing values, and parsed field configuration.
 * @returns The mutation payload with derived values inserted.
 */
export function coordinateMutation(input: MutationCoordinatorInput): MutationCoordinatorResult {
	const payload: Record<string, unknown> = { ...input.payload }
	const derivedSlugs = new Map<string, string | null>()
	const changedSlugFields: string[] = []
	const changedPermalinkFields: string[] = []

	for (const field of input.configuration.slugs) {
		if (input.fieldKeys && !input.fieldKeys.has(field.field)) continue
		const result = resolveSlugValue(input, field)
		if (!result.shouldWrite) continue
		payload[field.field] = result.value
		derivedSlugs.set(field.field, result.value)
		if (input.kind === 'create' || slugChanged(input, field, result.value)) {
			changedSlugFields.push(field.field)
		}
	}

	for (const field of input.configuration.permalinks) {
		if (input.fieldKeys && !input.fieldKeys.has(field.field)) continue
		const result = resolvePermalinkValue(input, field, derivedSlugs)
		if (!result.shouldWrite) continue
		payload[field.field] = result.value
		if (
			input.kind === 'create' ||
			(typeof input.existingItem[field.field] === 'string'
				? input.existingItem[field.field]
				: null) !== result.value
		) {
			changedPermalinkFields.push(field.field)
		}
	}

	return { payload, changedSlugFields, changedPermalinkFields }
}
