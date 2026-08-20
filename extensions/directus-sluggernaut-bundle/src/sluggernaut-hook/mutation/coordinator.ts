/**
 * @fileoverview Coordinates pure derived-field mutation values.
 *
 * Coordinates derived-field values during Directus item mutations.
 *
 * Slugs are resolved before permalinks because a permalink may depend on a slug produced by the
 * same mutation. The coordinator is deliberately pure: callers decide whether the returned
 * payload is written through Directus services or directly through the transaction database.
 */
import type {
	CollectionConfiguration,
	DiscoveredPermalinkField,
	DiscoveredSlugField,
} from '../../shared/configuration/types'

import { hasKey, isString } from '@onderwijsin/directus-extension-utils'

import {
	applyTrailingSlash,
	deriveSlug,
	normalizeManualPermalink,
	joinPrefixAndSlug,
	normalizeSlug,
	resolveFinalValue,
} from '../../shared/values/normalization'

/** Mutation context that determines when derived values should be refreshed. */
export type MutationKind = 'create' | 'update' | 'recalculate'

/** Input required to derive Sluggernaut values for one mutation. */
export interface MutationCoordinatorInput {
	kind: MutationKind
	payload: Readonly<Record<string, unknown>>
	existingItem: Readonly<Record<string, unknown>>
	configuration: CollectionConfiguration
	/** Fields to recalculate; omitted means all configured fields. */
	fieldKeys?: ReadonlySet<string>
}

export interface MutationCoordinatorResult {
	/** A shallow copy of the input payload with derived fields applied. */
	payload: Record<string, unknown>
}

/**
 * Checks whether a payload contains any field from a configured set.
 * @param payload - Incoming mutation payload.
 * @param fields - Field keys to inspect.
 * @returns Whether at least one field is present.
 */
function hasAnyField(payload: Readonly<Record<string, unknown>>, fields: readonly string[]) {
	return fields.some((field) => hasKey(payload, field))
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
	const explicitlySupplied = hasKey(input.payload, field.field)
	const sourceChanged = hasAnyField(input.payload, field.options.sourceFields)
	// Creates and recalculations always derive; updates derive only when configured source fields changed.
	const shouldDerive =
		input.kind === 'create' ||
		input.kind === 'recalculate' ||
		(field.options.updateOnSourceChange && sourceChanged)

	if (explicitlySupplied) {
		// An explicit value wins over derivation, but still passes through the same normalization rules.
		const value = input.payload[field.field]
		if (value !== null && value !== undefined && !isString(value)) {
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
			value: isString(existingValue) ? existingValue : null,
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
	return isString(value) ? value : null
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
	return (isString(previous) ? previous : null) !== value
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
	const explicitlySupplied = hasKey(input.payload, field.field)
	if (explicitlySupplied) {
		const value = input.payload[field.field]
		if (value !== null && value !== undefined && !isString(value)) {
			throw new Error(`Permalink field "${field.field}" must receive a string or null value.`)
		}
		return {
			value: normalizeManualPermalink(value, {
				prefix: field.options.generateFromSlug ? field.options.prefix : undefined,
				validatePrefix:
					field.options.generateFromSlug && field.options.validatePrefixOnManualInput,
				trailingSlash: field.options.trailingSlash,
				enforceTrailingSlash: field.options.enforceTrailingSlashOnManualInput,
			}),
			shouldWrite: true,
		}
	}

	if (!field.options.generateFromSlug) return { value: null, shouldWrite: false }
	const slugField = field.options.slugField
	if (!slugField) return { value: null, shouldWrite: false }
	const slugConfiguration = input.configuration.slugs.find(
		(candidate) => candidate.field === slugField,
	)
	if (!slugConfiguration) return { value: null, shouldWrite: false }
	const finalSlug = derivedSlugs.has(slugField)
		? (derivedSlugs.get(slugField) ?? null)
		: finalSlugValue(input, slugConfiguration, derivedSlugs)
	const shouldSynchronize =
		input.kind === 'create' ||
		input.kind === 'recalculate' ||
		(field.options.updateOnSlugChange && slugChanged(input, slugConfiguration, finalSlug))
	if (!shouldSynchronize) return { value: null, shouldWrite: false }
	// A cleared slug must clear its generated permalink as well.
	if (finalSlug === null) return { value: null, shouldWrite: true }

	return {
		value: applyTrailingSlash(
			joinPrefixAndSlug(
				field.options.prefix,
				finalSlug,
				slugConfiguration.options.locale,
				slugConfiguration.options.lowercase,
			),
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

	// Resolve slugs first so dependent permalink fields see the final slug values.
	for (const field of input.configuration.slugs) {
		if (input.fieldKeys && !input.fieldKeys.has(field.field)) continue
		const result = resolveSlugValue(input, field)
		if (!result.shouldWrite) continue
		payload[field.field] = result.value
		derivedSlugs.set(field.field, result.value)
	}

	// Permalinks are resolved after all slug fields have been processed.
	for (const field of input.configuration.permalinks) {
		if (input.fieldKeys && !input.fieldKeys.has(field.field)) continue
		const result = resolvePermalinkValue(input, field, derivedSlugs)
		if (!result.shouldWrite) continue
		payload[field.field] = result.value
	}

	return { payload }
}
