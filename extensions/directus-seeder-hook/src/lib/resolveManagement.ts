import type { SchemaOverview } from '@directus/types'
import type { CollectionManagement, ResolvedCollectionManagement } from './collectionManagement'
import type { SeedItem } from './seedItem'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { seedItemsSchema } from './seedItem'

/**
 * Selects scalar key validation for the live field type without coercion or nested writes.
 * @param type - Directus field type.
 * @returns Schema for string or safe integer keys.
 */
function getKeySchema(type: string | undefined) {
	if (type === 'uuid')
		return z.uuid().refine((value) => value === value.toLowerCase(), {
			error: 'Relation management requires canonical lowercase UUIDs',
		})
	if (type === 'integer' || type === 'bigInteger') return z.int()
	if (type === 'string') return z.string().min(1)
	throw new Error(`Unsupported relation management key type: ${type ?? 'missing'}`)
}

/**
 * Resolves one direct M2O boundary from raw source seeds, independent of import/extraction selection.
 * @param collectionName - Managed collection.
 * @param management - Validated declarative boundary.
 * @param seedsFolder - Git-managed seed directory, read before extraction cleanup.
 * @param schema - Live schema used to verify the direct relation and representable scalar keys.
 * @returns A snapshotted boundary shared by validation, extraction and synchronization.
 */
export async function resolveCollectionManagement(
	collectionName: string,
	management: CollectionManagement,
	seedsFolder: string,
	schema: SchemaOverview,
): Promise<ResolvedCollectionManagement> {
	if (management.type === 'id-range') return management
	const filename = path.join(seedsFolder, `${management.collection}.json`)
	try {
		const target = schema.collections[collectionName]
		const source = schema.collections[management.collection]
		const field = target?.fields[management.field]
		const relation = schema.relations.find(
			(entry) => entry.collection === collectionName && entry.field === management.field,
		)
		const sourceType = source?.fields.id?.type
		// Directus can expose a UUID FK as string (for example SQLite permissions.policy).
		const compatibleKeyTypes =
			field?.type === sourceType ||
			(['uuid', 'string'].includes(field?.type ?? '') &&
				['uuid', 'string'].includes(sourceType ?? '')) ||
			(['integer', 'bigInteger'].includes(field?.type ?? '') &&
				['integer', 'bigInteger'].includes(sourceType ?? ''))
		if (
			target?.primary !== 'id' ||
			source?.primary !== 'id' ||
			!field ||
			field.alias ||
			!compatibleKeyTypes ||
			relation?.related_collection !== management.collection ||
			!relation.schema ||
			relation.schema.foreign_key_table !== management.collection ||
			relation.schema.foreign_key_column !== 'id'
		) {
			throw new Error(
				`Management field "${collectionName}.${management.field}" must be a direct scalar relation to "${management.collection}.id" with id primary keys`,
			)
		}
		getKeySchema(target.fields.id?.type)
		const fieldKeySchema = getKeySchema(field.type)
		const sourceKeySchema = getKeySchema(source.fields.id?.type)
		const raw: unknown = JSON.parse(await readFile(filename, 'utf8'))
		const rows = seedItemsSchema.parse(raw)
		const ids = rows.map((row, index) => {
			try {
				const record = z.looseObject({ id: z.unknown() }).parse(row)
				const id = sourceKeySchema.parse(record.id)
				fieldKeySchema.parse(id)
				return id
			} catch (error) {
				throw new Error(`Invalid related seed ID at row ${index + 1}`, { cause: error })
			}
		})
		if (new Set(ids).size !== ids.length) throw new Error('Duplicate related seed IDs')
		return { ...management, ids }
	} catch (error) {
		throw new Error(
			`Failed to resolve relation management for collection "${collectionName}" from "${filename}": ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ cause: error },
		)
	}
}

/**
 * Checks target IDs before querying for collisions; relation values are validated by membership.
 * @param collectionName - Managed collection.
 * @param data - Original seed rows.
 * @param schema - Live schema.
 * @returns Nothing.
 */
export function validateRelationSeedKeys(
	collectionName: string,
	data: SeedItem[],
	schema: SchemaOverview,
): void {
	for (const [index, row] of data.entries()) {
		try {
			const record = z.looseObject({ id: z.unknown() }).parse(row)
			getKeySchema(schema.collections[collectionName]?.fields.id?.type).parse(record.id)
		} catch (error) {
			throw new Error(
				`Invalid relation-managed seed ID for collection "${collectionName}" at row ${index + 1}`,
				{ cause: error },
			)
		}
	}
}
