import type { RecalculateOptions } from './options.schema'

import { isDefined } from '@onderwijsin/directus-extension-utils'

import { discoverCollectionConfiguration } from '../shared/configuration/discovery'

export type RecalculationConfiguration = ReturnType<typeof discoverCollectionConfiguration>

/**
 * Selects the configured derived fields allowed by the operation input.
 * @param options - Validated operation options.
 * @param configuration - Discovered collection configuration.
 * @returns Selected derived field keys.
 */
export function selectFieldKeys(
	options: RecalculateOptions,
	configuration: RecalculationConfiguration,
): ReadonlySet<string> {
	const derivedFields = [
		...configuration.slugs.map((field) => field.field),
		...configuration.permalinks
			.filter((field) => field.options.generateFromSlug)
			.map((field) => field.field),
	]
	if (!isDefined(options.fields)) return new Set(derivedFields)

	const requestedFields = new Set(options.fields)
	return new Set(derivedFields.filter((field) => requestedFields.has(field)))
}

/**
 * Finds the collection primary key from Directus field metadata.
 * @param fields - Directus field service results.
 * @returns Primary key field name, or `id` when metadata is incomplete.
 */
export function primaryKeyFromFields(
	fields: readonly { field: string; schema?: { is_primary_key?: boolean } | null }[],
): string {
	return fields.find((field) => field.schema?.is_primary_key === true)?.field ?? 'id'
}

/**
 * Collects the fields required to derive every configured value for an item.
 * @param primaryKey - Collection primary key field.
 * @param configuration - Discovered collection configuration.
 * @returns Deduplicated item field keys.
 */
export function requiredItemFields(
	primaryKey: string,
	configuration: RecalculationConfiguration,
): string[] {
	const fields = new Set<string>([primaryKey])
	for (const field of configuration.slugs) {
		for (const sourceField of field.options.sourceFields) fields.add(sourceField)
		fields.add(field.field)
	}
	for (const field of configuration.permalinks) {
		fields.add(field.field)
		if (field.options.slugField !== undefined) fields.add(field.options.slugField)
	}
	return [...fields]
}
