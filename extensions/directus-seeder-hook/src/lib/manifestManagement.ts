import type { SchemaOverview } from '@directus/types'
import type { SeederConfig } from './config'
import type { SeedItem } from './seedItem'

import path from 'node:path'

import { z } from 'zod'

import { outputFileAtomic, readRegularFile } from './filesystem'
import { getManagementKeySchema } from './managementKeys'

/**
 * Requires a representable scalar id primary key for manifest membership.
 * @param collectionName - Managed collection.
 * @param schema - Live Directus schema.
 * @returns Schema matching this collection's primary key.
 */
function getManifestKeySchema(collectionName: string, schema: SchemaOverview) {
	const collection = schema.collections[collectionName]
	if (collection?.primary !== 'id' || collection.fields.id?.alias) {
		throw new Error(
			`Manifest management for collection "${collectionName}" requires an id primary key`,
		)
	}
	return getManagementKeySchema(collection.fields.id?.type)
}

/**
 * Reads and validates a manifest, allowing absence only during extraction.
 * @param filename - Derived manifest path.
 * @param keySchema - Live primary-key validator.
 * @param allowMissing - Whether extraction may create a new manifest.
 * @returns Validated historical IDs.
 */
async function readManifest(
	filename: string,
	keySchema: ReturnType<typeof getManifestKeySchema>,
	allowMissing: boolean,
): Promise<(string | number)[]> {
	let content: string
	try {
		content = await readRegularFile(filename)
	} catch (error) {
		if (allowMissing && error instanceof Error && 'code' in error && error.code === 'ENOENT')
			return []
		throw error
	}
	const raw: unknown = JSON.parse(content)
	return z.array(keySchema).parse(raw)
}

/**
 * Snapshots required manifest membership without changing the file.
 * @param collectionName - Managed collection.
 * @param seedsFolder - Seed directory containing the manifest.
 * @param schema - Live Directus schema.
 * @returns Validated historical IDs.
 */
export async function readManagedIds(
	collectionName: string,
	seedsFolder: string,
	schema: SchemaOverview,
): Promise<(string | number)[]> {
	const filename = path.join(seedsFolder, `${collectionName}.managed-ids.json`)
	try {
		return await readManifest(filename, getManifestKeySchema(collectionName, schema), false)
	} catch (error) {
		throw new Error(
			`Failed to resolve manifest management for collection "${collectionName}" from "${filename}": ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ cause: error },
		)
	}
}

/**
 * Validates explicit seed IDs against the live manifest-managed primary key.
 * @param collectionName - Managed collection.
 * @param data - Extracted or imported seed rows.
 * @param schema - Live Directus schema.
 * @returns Validated explicit IDs, without coercion.
 */
export function getManifestSeedIds(
	collectionName: string,
	data: SeedItem[],
	schema: SchemaOverview,
): (string | number)[] {
	const rowSchema = z.looseObject({ id: getManifestKeySchema(collectionName, schema) })
	return data.map((row, index) => {
		const parsed = rowSchema.safeParse(row)
		if (!parsed.success) {
			throw new Error(
				`Invalid manifest-managed seed ID for collection "${collectionName}" at row ${index + 1}: ${parsed.error.message}`,
			)
		}
		return parsed.data.id
	})
}

/**
 * Unions current extracted IDs with validated history and atomically replaces the manifest.
 * @param collectionName - Extracted collection.
 * @param data - Current extracted rows; existing seed files are never read.
 * @param seedsFolder - Seed directory containing the manifest.
 * @param schema - Live Directus schema.
 * @param jsonIndent - Configured JSON indentation.
 * @returns Resolves after the historical union is safely written.
 */
export async function updateManagedIds(
	collectionName: string,
	data: SeedItem[],
	seedsFolder: string,
	schema: SchemaOverview,
	jsonIndent: SeederConfig['jsonIndent'],
): Promise<void> {
	const filename = path.join(seedsFolder, `${collectionName}.managed-ids.json`)
	try {
		const current = getManifestSeedIds(collectionName, data, schema)
		const historical = await readManifest(
			filename,
			getManifestKeySchema(collectionName, schema),
			true,
		)
		const ids = [...new Set([...historical, ...current])].sort((left, right) => {
			if (typeof left === 'number' && typeof right === 'number') return left - right
			return left < right ? -1 : left > right ? 1 : 0
		})
		await outputFileAtomic(filename, `${JSON.stringify(ids, null, jsonIndent)}\n`)
	} catch (error) {
		throw new Error(
			`Failed to update manifest management for collection "${collectionName}" at "${filename}": ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ cause: error },
		)
	}
}
