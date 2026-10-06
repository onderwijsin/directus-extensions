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

import { hasKey, isDefined, isString } from '@onderwijsin/directus-extension-utils'

import { sluggernautValidationError } from '../../shared/errors'
import {
	deriveSlug,
	normalizeManualPermalink,
	normalizeSlug,
	resolveEffectiveFieldValue,
} from '../../shared/values/normalization'
import { compilePathTemplate, renderPathTemplate } from '../../shared/values/path-template'

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
		resolveEffectiveFieldValue(payload, existingItem, sourceField),
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
		if (value !== null && isDefined(value) && !isString(value)) {
			throw sluggernautValidationError(
				`Slug field "${field.field}" must receive a string or null value.`,
			)
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
			sourceValues(
				input.kind === 'create'
					? { ...field.sourceDefaults, ...input.payload }
					: input.payload,
				input.existingItem,
				field,
			),
			field.options.locale,
			field.options.lowercase,
		),
		shouldWrite: true,
	}
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
		if (value !== null && isDefined(value) && !isString(value)) {
			throw sluggernautValidationError(
				`Permalink field "${field.field}" must receive a string or null value.`,
			)
		}
		return {
			value: normalizeManualPermalink(value, {
				trailingSlash: field.options.trailingSlash,
				enforceTrailingSlash: field.options.enforceTrailingSlashOnManualInput,
			}),
			shouldWrite: true,
		}
	}

	if (!field.options.generateFromTemplate) return { value: null, shouldWrite: false }
	const template = compilePathTemplate(field.options)
	const effectivePayload = {
		...(input.kind === 'create' ? field.dependencyDefaults : {}),
		...input.payload,
		...Object.fromEntries(derivedSlugs),
	}
	const dependencyChanged = [...template.dependencies].some(
		(dependency) =>
			resolveEffectiveFieldValue(effectivePayload, input.existingItem, dependency) !==
			input.existingItem[dependency],
	)
	const shouldSynchronize =
		input.kind === 'create' ||
		input.kind === 'recalculate' ||
		(field.options.updateOnDependencyChange && dependencyChanged)
	if (!shouldSynchronize) return { value: null, shouldWrite: false }
	return {
		value: renderPathTemplate(
			template,
			effectivePayload,
			input.existingItem,
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
