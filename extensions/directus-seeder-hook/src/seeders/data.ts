import type { SeederOptions } from '../env.schema'
import type { DataScope } from '../lib/config'
import type { CollectionDataProvider } from '../lib/seedDataParser'
import type { SeedItem } from '../lib/seedItem'

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { createCollectionDataProvider } from '../lib/seedDataParser'
import { seedItemsSchema } from '../lib/seedItem'
import { getFolderPaths } from './resolveConfig'
import { SYSTEM_COLLECTIONS_ORDER } from './system/config'
import { createSystemDataProviders, getRequiredSystemCollections } from './system/data'

/** Collection input loaded from a validated JSON array. */
export interface CollectionData {
	/** Collection identifier in the selected scope. */
	collection: string
	/** Original parsed rows, retained unchanged for core collections. */
	data: SeedItem[]
}

/**
 * Validates that parsed JSON data is an array as expected for collection data.
 * Collection seed files should always contain arrays of items.
 *
 * @param data - Unknown data from JSON parsing
 * @returns Type predicate confirming data is a valid collection array
 */
const validateCollectionData = (data: unknown): data is SeedItem[] =>
	seedItemsSchema.safeParse(data).success

/**
 * Parses and validates JSON content for a specific collection.
 * Rejects invalid input without substituting an empty dataset.
 *
 * @param collection - Collection name for type inference and error reporting
 * @param fileContent - Raw JSON string content from file
 * @returns The original array, preserving every row unchanged
 * @throws If JSON syntax or the array boundary is invalid
 */
const parseCollectionData = (collection: string, fileContent: string): SeedItem[] => {
	const parsedData: unknown = JSON.parse(fileContent)
	if (!validateCollectionData(parsedData)) {
		throw new Error(`Expected a JSON array for collection "${collection}"`)
	}
	return parsedData
}

/**
 * Loads required collection input from the seeds folder.
 * Preflights required JSON files in the supplied collection order before any database operations.
 * Only ENOENT omits a collection; an explicit empty array remains seed data.
 * Reads of unused files only detect their presence; their content and errors are ignored.
 *
 * @param seedsFolder - Path to the folder containing collection JSON files
 * @param requiredCollections - Selected collections and any required Flow metadata
 * @param collectionsOrder - Available collections in the selected scope's processing order
 * @returns Required collection data, or null when no supported files exist
 * @throws If the seed directory is missing or invalid, or required input cannot be read, parsed, or validated
 */
const getCollectionData = async (
	seedsFolder: string,
	requiredCollections: string[],
	collectionsOrder = SYSTEM_COLLECTIONS_ORDER,
): Promise<CollectionData[] | null> => {
	try {
		const directory = await stat(seedsFolder)
		if (!directory.isDirectory()) {
			throw new Error(`Seed path is not a directory: "${seedsFolder}"`)
		}
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			throw new Error(`Seed directory does not exist: "${seedsFolder}"`, { cause: error })
		}
		const message = error instanceof Error ? error.message : 'Unknown directory error'
		throw new Error(`Failed to inspect seed directory "${seedsFolder}": ${message}`, {
			cause: error,
		})
	}

	const results: CollectionData[] = []
	let hasSupportedSeedFiles = false

	// Process each collection in the defined order
	for (const collection of collectionsOrder) {
		// Construct the collection path inside the resolved scope directory.
		const dataFilePath = path.join(seedsFolder, `${collection}.json`)
		const required = requiredCollections.includes(collection)
		try {
			// Read and parse collection data file
			const fileContent = await readFile(dataFilePath, 'utf-8')
			hasSupportedSeedFiles = true
			if (!required) continue
			const data = parseCollectionData(collection, fileContent)
			results.push({ collection, data })
		} catch (error) {
			if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
			if (!required) {
				hasSupportedSeedFiles = true
				continue
			}
			const errorMessage = error instanceof Error ? error.message : 'Unknown file error'
			throw new Error(
				`Failed to load seed file "${dataFilePath}" for collection "${collection}": ${errorMessage}`,
				{ cause: error },
			)
		}
	}

	return hasSupportedSeedFiles ? results : null
}

/**
 * Loads selected collection input and applies the selected scope's provider handling.
 * @param env - Environment variables for seed paths and system transformations.
 * @param selectedCollections - Collection names selected by resolved include/exclude settings.
 * @param scope - Selected data scope; only system receives built-in transformations.
 * @returns Selected providers in dependency order, or null when no supported files exist.
 * @throws Error if loading or data provider creation fails.
 */
export const getDataProviders = async (
	env: SeederOptions,
	selectedCollections: string[] = SYSTEM_COLLECTIONS_ORDER,
	scope: DataScope = 'system',
): Promise<CollectionDataProvider[] | null> => {
	try {
		const { seedsFolder } = getFolderPaths(env, scope)
		if (scope === 'core') {
			const data = await getCollectionData(
				seedsFolder,
				selectedCollections,
				selectedCollections,
			)
			return (
				data?.map(({ collection, data: rows }) =>
					createCollectionDataProvider(collection, () => rows),
				) ?? null
			)
		}

		const requiredCollections = getRequiredSystemCollections(selectedCollections, env)
		const systemCollectionData = await getCollectionData(seedsFolder, requiredCollections)
		if (systemCollectionData === null) return null
		return createSystemDataProviders(systemCollectionData, env, selectedCollections)
	} catch (error) {
		// Handle any errors in the data provider creation process
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		// @todo: replace console.* with logger.*
		console.error(`Failed to create data providers: ${errorMessage}`)
		throw new Error(`Data provider creation failed: ${errorMessage}`)
	}
}
