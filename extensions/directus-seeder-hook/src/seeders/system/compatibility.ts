import type { SchemaOverview } from '@directus/types'
import type { SeederConfig } from '../../lib/config'
import type { SeedData } from '../../lib/seedDataParser'
import type { CollectionConfig } from '../config.schema'

import { hasKey, isRecord } from '@onderwijsin/directus-extension-utils/server'

// Directus 12.4 adds Flow folders. Only these two fields have legacy equivalents.
const FLOW_FOLDER_FIELDS = [
	{ collection: 'directus_folders', field: 'type', legacyValue: 'files' },
	{ collection: 'directus_flows', field: 'folder', legacyValue: null },
]

/**
 * Adapts only inherited built-in Flow-folder fields to the schema used by the query.
 * @param collection - Effective extraction settings.
 * @param schema - The same Directus schema passed to ItemsService.
 * @param fieldOverrides - Collections with explicit consumer fields, including null or default-equivalent arrays.
 * @returns Query fields, leaving every explicit selection unchanged.
 */
export function getCompatibleExtractionFields(
	collection: CollectionConfig,
	schema: SchemaOverview,
	fieldOverrides: SeederConfig['systemFieldOverrides'],
): string[] {
	const fields = collection.fields ?? ['*']
	if (fieldOverrides?.includes(collection.collection)) return fields
	return fields.filter(
		(field) =>
			!FLOW_FOLDER_FIELDS.some(
				(entry) =>
					entry.collection === collection.collection &&
					entry.field === field &&
					!schema.collections[entry.collection]?.fields[field],
			),
	)
}

/**
 * Preflights selected seed data before any writes, translating only legacy-equivalent values.
 * Directus itself may drop unknown payload fields; meaningful Flow-folder data must fail here.
 * @param data - Selected and transformed system seed input.
 * @param schema - Current Directus schema.
 * @returns Seed data with only unsupported 'files' types and null Flow folders removed.
 * @throws Error when the target cannot represent a supplied Flow-folder value.
 */
export function prepareCompatibleSystemData(data: SeedData, schema: SchemaOverview): SeedData {
	const compatible = { ...data }
	for (const { collection, field, legacyValue } of FLOW_FOLDER_FIELDS) {
		if (schema.collections[collection]?.fields[field]) continue
		const rows = data[collection]
		if (!rows) continue
		compatible[collection] = rows.map((row, index) => {
			if (!isRecord(row) || !hasKey(row, field)) return row
			if (row[field] !== legacyValue) {
				throw new Error(
					`Cannot import ${collection}.json processed row ${index + 1}: target schema lacks ${collection}.${field}; this value cannot be represented safely. Use a Directus version with Flow-folder support.`,
				)
			}
			const translated = { ...row }
			delete translated[field]
			return translated
		})
	}
	return compatible
}
