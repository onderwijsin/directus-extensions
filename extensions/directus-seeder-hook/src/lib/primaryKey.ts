import type { SchemaOverview } from '@directus/types'
import type { SeedItem } from './seedItem'

import { z } from 'zod'

import { getManagementKeySchema } from './managementKeys'

/**
 * Resolves a representable scalar primary key from the live collection schema.
 * @param collectionName - Collection to inspect.
 * @param schema - Live Directus schema.
 * @returns Validated primary-key field name, without an implicit fallback.
 */
export function getCollectionPrimaryKey(collectionName: string, schema: SchemaOverview): string {
	const collection = schema.collections?.[collectionName]
	const primary = collection?.primary
	const field = primary ? collection?.fields?.[primary] : undefined
	if (typeof primary !== 'string' || !primary || !field || field.alias) {
		throw new Error(
			`Collection "${collectionName}" requires a scalar primary key in the live schema`,
		)
	}
	try {
		getManagementKeySchema(field.type)
	} catch (error) {
		throw new Error(`Unsupported primary key "${collectionName}.${primary}": ${field.type}`, {
			cause: error,
		})
	}
	return primary
}

/**
 * Selects strict key validation for the collection's actual primary field.
 * @param collectionName - Collection to inspect.
 * @param schema - Live Directus schema.
 * @returns A validator for canonical UUIDs, nonempty strings, safe integers, or decimal bigints.
 */
export function getCollectionPrimaryKeySchema(collectionName: string, schema: SchemaOverview) {
	const primary = getCollectionPrimaryKey(collectionName, schema)
	return getManagementKeySchema(schema.collections[collectionName]?.fields[primary]?.type)
}

/**
 * Preflights schema-compatible seed keys before any selected collection can mutate.
 * @param collectionName - Collection being imported.
 * @param data - Unmodified seed rows.
 * @param schema - Live Directus schema.
 * @returns Nothing; invalid or duplicate keys fail closed without database reads.
 */
export function validateCollectionSeedKeys(
	collectionName: string,
	data: SeedItem[],
	schema: SchemaOverview,
): void {
	const primary = getCollectionPrimaryKey(collectionName, schema)
	const keySchema = getCollectionPrimaryKeySchema(collectionName, schema)
	const rowSchema = z.looseObject({})
	const keys = new Set<string | number>()
	for (const [index, row] of data.entries()) {
		const record = rowSchema.safeParse(row)
		const key = keySchema.safeParse(record.success ? record.data[primary] : undefined)
		if (!key.success) {
			throw new Error(
				`Invalid seed primary key "${collectionName}.${primary}" at row ${index + 1}`,
				{ cause: key.error },
			)
		}
		if (keys.has(key.data)) {
			throw new Error(
				`Duplicate seed primary key "${collectionName}.${primary}" at row ${index + 1}`,
			)
		}
		keys.add(key.data)
	}
}
