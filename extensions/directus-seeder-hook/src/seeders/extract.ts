import type { HookExtensionContext, SchemaOverview } from '@directus/types'
import type { SeederConfig } from '../lib/config'
import type { CollectionConfig } from './config.schema'

import path from 'node:path'

import { getIdRangeFilters } from '../lib/collectionManagement'
import { outputFile, prepareExtractionDirectories } from '../lib/filesystem'
import { updateManagedIds } from '../lib/manifestManagement'
import { createPerformanceTracker } from '../lib/performanceTracker'
import { getCollectionPrimaryKey, validateCollectionSeedKeys } from '../lib/primaryKey'
import { seedItemsSchema } from '../lib/seedItem'
import { getCollections } from './resolveConfig'
import { extractAssets } from './system/assets'
import { getCompatibleExtractionFields } from './system/compatibility'
import { SYSTEM_COLLECTIONS_ORDER, SYSTEM_UNEXTRACTABLE_COLLECTIONS } from './system/config'
import { prepareSystemExtractionData } from './system/data'

// Constants

const LOG_DIVIDER = '-'.repeat(60)

// Types and Interfaces

interface ExtractOptions extends SeederConfig {
	folders: {
		seeds: string
		assets: string
	}
	context: HookExtensionContext
}

// Utility Functions

/**
 * Validates extraction options to ensure required parameters are present.
 *
 * @param options - The extraction options to validate
 * @returns Nothing.
 * @throws Error if validation fails
 */
const validateExtractOptions = (options: ExtractOptions): void => {
	if (!options.context) {
		throw new Error('Context is required for extraction operations')
	}

	if (!options.folders?.seeds) {
		throw new Error('Seeds folder path is required')
	}

	if (!options.folders?.assets) {
		throw new Error('Assets folder path is required')
	}
}

/**
 * Filters collections based on include/exclude criteria.
 *
 * @param includeCollections - Collections to include (if specified, only these will be processed)
 * @param excludeCollections - Collections to exclude from processing
 * @param collectionsOrder - Effective processing order, retaining the existing selection rules.
 * @returns Filtered array of collection names
 */
export const getFilteredCollections = (
	includeCollections?: unknown[],
	excludeCollections?: unknown[],
	collectionsOrder = SYSTEM_COLLECTIONS_ORDER,
): string[] => {
	let collectionsToExtract = [...collectionsOrder].filter(
		(collection) => !SYSTEM_UNEXTRACTABLE_COLLECTIONS.includes(collection),
	)

	if (includeCollections && includeCollections.length > 0) {
		collectionsToExtract = collectionsToExtract.filter((collection) =>
			includeCollections.includes(collection),
		)
	}

	if (excludeCollections && excludeCollections.length > 0) {
		collectionsToExtract = collectionsToExtract.filter(
			(collection) => !excludeCollections.includes(collection),
		)
	}

	return collectionsToExtract
}

/**
 * Generates the complete file path for a seed file.
 *
 * @param seedsFolder - The base seeds folder path
 * @param collectionName - The name of the collection
 * @returns The complete file path for the seed file
 */
const generateSeedFilePath = (seedsFolder: string, collectionName: string): string => {
	return path.join(seedsFolder, `${collectionName}.json`)
}

/**
 * Logs a visual divider for better log readability.
 *
 * @param logger - The logger instance
 * @returns Nothing.
 */
const logDivider = (logger: HookExtensionContext['logger']): void => {
	logger.info(LOG_DIVIDER)
}

/**
 * Combines the collection's extraction filter with its optional numeric ID range.
 * Relation management only bounds import and does not select extraction rows.
 * @param collection - Validated effective settings.
 * @param primaryKey - Live primary key for application collections.
 * @returns Directus extraction filter.
 */
const getExtractionFilter = (
	collection: CollectionConfig,
	primaryKey = 'id',
): CollectionConfig['filter'] => {
	const { filter, management } = collection
	if (management?.type !== 'id-range') return filter
	return { _and: [...(filter ? [filter] : []), ...getIdRangeFilters(management, primaryKey)] }
}

/**
 * Validates core identity and explicit field selections before cleanup or service reads.
 * @param collection - Application collection settings.
 * @param schema - Live schema supplied by Directus.
 * @returns The usable primary-key field name.
 */
function validateCoreExtraction(collection: CollectionConfig, schema: SchemaOverview): string {
	const primary = getCollectionPrimaryKey(collection.collection, schema)
	const fields = collection.fields ?? ['*']
	if (!fields.includes('*') && !fields.includes(primary))
		throw new Error(
			`Core extraction fields for collection "${collection.collection}" must include primary key "${primary}" or "*"`,
		)
	if (
		collection.management?.type === 'id-range' &&
		!['integer', 'bigInteger'].includes(
			schema.collections[collection.collection]?.fields[primary]?.type ?? '',
		)
	)
		throw new Error(
			`id-range management for collection "${collection.collection}" requires a numeric integer primary key`,
		)
	return primary
}

/**
 * Extracts data from a single collection and writes it to a JSON file.
 *
 * @param collection - Effective settings of the collection to extract
 * @param seedsFolder - The folder to write seed files to
 * @param context - Directus hook extension context
 * @param jsonIndent - Indentation for the extracted JSON
 * @param fieldOverrides - Collections whose consumer fields must be passed unchanged.
 * @param scope - Selected scope; compatibility transforms apply only to system.
 * @returns Promise<boolean> - True if extraction was successful, false otherwise
 */
const extractSingleCollection = async (
	collection: CollectionConfig,
	seedsFolder: string,
	context: HookExtensionContext,
	jsonIndent: SeederConfig['jsonIndent'],
	fieldOverrides: SeederConfig['systemFieldOverrides'],
	scope: SeederConfig['dataScope'],
): Promise<boolean> => {
	const { logger, services, getSchema, database: knex } = context
	const collectionName = collection.collection
	try {
		logger.info(`📦 Extracting collection: ${collectionName}`)
		const schema = await getSchema()
		const primaryKey = scope === 'core' ? validateCoreExtraction(collection, schema) : 'id'

		const service = new services.ItemsService(collectionName, {
			schema,
			knex,
		})

		// Like the service adapters, pass validated query data through a plain object. Directus's
		// Filter types omit supported JSON logical predicates and GeoJSON geometry values.
		const query: Record<string, unknown> = {
			limit: -1,
			fields:
				scope === 'system'
					? getCompatibleExtractionFields(collection, schema, fieldOverrides)
					: (collection.fields ?? ['*']),
			filter: getExtractionFilter(collection, primaryKey),
			sort: collection.sort ?? null,
			deep: collection.deep ?? null,
		}
		let data = seedItemsSchema.parse(await service.readByQuery(query))
		if (scope === 'system') data = prepareSystemExtractionData(collectionName, data)
		else validateCollectionSeedKeys(collectionName, data, schema)

		const absoluteFilePath = generateSeedFilePath(seedsFolder, collectionName)
		await outputFile(absoluteFilePath, `${JSON.stringify(data, null, jsonIndent)}\n`)
		if (collection.management?.type === 'manifest') {
			await updateManagedIds(collectionName, data, seedsFolder, schema, jsonIndent)
		}

		logger.info(`✅ Extracted ${data.length} items from ${collectionName}`)
		logger.trace(`📄 File written to: ${absoluteFilePath}`)

		return true
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		logger.error(`❌ Failed to extract collection ${collectionName}: ${message}`)
		logger.error(error)
		return false
	}
}

// Main Functions

/**
 * Loops through selected collections in order and writes their data to JSON files in the
 * specified seeds folder. System collections retain their built-in extraction handling.
 * Extracted collections can be filtered using include/exclude options.
 *
 * @param options - Configuration options for extraction
 * @param options.includeCollections - Optional array of collection names to include (if provided,
 * only these will be extracted)
 * @param options.excludeCollections - Optional array of collection names to exclude from extraction
 * @param options.folders - Folder configuration for seeds and assets
 * @param options.context - Directus hook extension context containing services and utilities
 *
 * @returns Resolves after collection extraction completes.
 * @throws Error if required options are missing or invalid
 */
export const extractSeedsFromCollections = async (options: ExtractOptions): Promise<void> => {
	validateExtractOptions(options)

	const { logger } = options.context
	const { includeCollections, excludeCollections, folders } = options

	const collections = getCollections(options)
	const collectionsToExtract = getFilteredCollections(
		includeCollections,
		excludeCollections,
		collections.map(({ collection }) => collection),
	)

	logger.info(
		`📋 Extracting ${collectionsToExtract.length} collections: ${collectionsToExtract.join(', ')}`,
	)
	logger.trace(`📁 Seeds folder path: ${folders.seeds}`)

	try {
		let successCount = 0
		let failureCount = 0

		for (const collection of collections.filter(({ collection }) =>
			collectionsToExtract.includes(collection),
		)) {
			const collectionName = collection.collection
			const performanceTracker = createPerformanceTracker()
			const success = await performanceTracker.track(
				`Extract ${collectionName}`,
				async () => {
					return await extractSingleCollection(
						collection,
						folders.seeds,
						options.context,
						options.jsonIndent,
						options.systemFieldOverrides,
						options.dataScope,
					)
				},
			)

			if (success) {
				successCount++
			} else {
				failureCount++
			}

			// Log performance data
			performanceTracker.outputFormatPerformanceData(logger)

			logDivider(logger)
		}

		logger.info(
			`🎯 Collection extraction complete: ${successCount} succeeded, ${failureCount} failed`,
		)
		if (failureCount > 0) throw new Error(`Failed to extract ${failureCount} collection(s)`)
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		logger.error(`❌ Failed to extract seeds: ${message}`)
		logger.error(error)
		throw error
	}
}

/**
 * Cleans managed output first, then exports selected JSON and optionally all binary assets.
 * Failures propagate to the CLI or automatic-task logger; partial output can be rerun.
 * @param options - Validated runtime configuration and output locations.
 * @returns Resolves only after every requested export succeeds.
 */
export async function extractData(options: ExtractOptions): Promise<void> {
	validateExtractOptions(options)
	const collections = getCollections(options)
	if (options.dataScope === 'core') {
		const selected = getFilteredCollections(
			options.includeCollections,
			options.excludeCollections,
			collections.map(({ collection }) => collection),
		)
		const schema = await options.context.getSchema()
		for (const collection of collections.filter(({ collection }) =>
			selected.includes(collection),
		))
			validateCoreExtraction(collection, schema)
	}
	const jsonOnly = options.jsonOnly || options.dataScope === 'core'
	if (!jsonOnly) {
		const otherSeeds = path.resolve(
			options.folders.seeds,
			'..',
			options.dataScope === 'system' ? 'core' : 'system',
		)
		const assets = path.resolve(options.folders.assets)
		if (otherSeeds === assets || otherSeeds.startsWith(`${assets}${path.sep}`))
			throw new Error(
				'Extraction directories conflict: assets must not equal or contain the other seed scope',
			)
	}
	let folders: ExtractOptions['folders']
	try {
		folders = await prepareExtractionDirectories(options.folders, jsonOnly, options.skipClean)
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		throw new Error(`Failed to prepare extraction output directories: ${message}`, {
			cause: error,
		})
	}
	const prepared = { ...options, folders }
	await extractSeedsFromCollections(prepared)
	if (!jsonOnly) await extractAssets(prepared.context, prepared.folders.assets)
}
