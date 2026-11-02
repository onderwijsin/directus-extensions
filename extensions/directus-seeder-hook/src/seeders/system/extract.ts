import type { HookExtensionContext } from '@directus/types'
import type { Filter, NestedDeepQuery } from '@directus/types'
import type { SeederConfig } from '../../lib/config'
import type { JsonFormatter } from '../../lib/formatJson'
import type { SeedItem } from '../../lib/seedItem'

import path from 'node:path'

import { z } from 'zod'

import { emptydir, ensureDir, outputFile } from '../../lib/filesystem'
import { createJsonFormatter } from '../../lib/formatJson'
import { createPerformanceTracker } from '../../lib/performanceTracker'
import { toSeedRecord } from '../../lib/seedItem'
import { SYSTEM_COLLECTIONS, SYSTEM_COLLECTIONS_ORDER } from './config'
import { sortOperationsForKeyConstraints } from './data'

// Constants

const UNEXTRACTABLE_COLLECTIONS = ['directus_extensions']
const LOG_DIVIDER = '-'.repeat(60)

// Types and Interfaces

interface ExtractOptions extends SeederConfig {
	folders: {
		seeds: string
		assets: string
	}
	context: HookExtensionContext
}

interface ExtractionResults {
	success: string[]
	failed: string[]
}

/** Validate asset-service fields at their point of use while retaining other file metadata. */
const fileDataSchema = z.looseObject({ id: z.string(), filename_disk: z.string() })
type FileData = z.infer<typeof fileDataSchema>

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
 * @returns Filtered array of collection names
 */
export const getFilteredCollections = (
	includeCollections?: unknown[],
	excludeCollections?: unknown[],
): string[] => {
	let collectionsToExtract = [...SYSTEM_COLLECTIONS_ORDER].filter(
		(collection) => !UNEXTRACTABLE_COLLECTIONS.includes(collection),
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
 * Finds the filter configuration for a given system collection that needs to be applied
 * when extracting data.
 *
 * @param collectionName - System collection to inspect.
 * @returns Filter | null | undefined
 */
const getSystemCollectionFilter = (collectionName: string): Filter | null | undefined => {
	const collectionConfig = SYSTEM_COLLECTIONS.find((c) => c.collection === collectionName)
	return collectionConfig?.filter
}

/**
 * Determines if a deep query is needed for a given system collection and returns the appropriate
 * structure.
 *
 * @param collectionName - System collection to inspect.
 * @returns NestedDeepQuery | null | undefined
 */
const getDeepQuery = (collectionName: string): NestedDeepQuery | null | undefined => {
	const collectionConfig = SYSTEM_COLLECTIONS.find((c) => c.collection === collectionName)
	return collectionConfig?.deep
}

/**
 * Finds the configuration of fields for a given system collection that needs to be applied when
 * extracting data.
 *
 * @param collectionName - System collection to inspect.
 * @returns string[] | null | undefined
 */
const getSystemCollectionFields = (collectionName: string): string[] | null | undefined => {
	const collectionConfig = SYSTEM_COLLECTIONS.find((c) => c.collection === collectionName)
	return collectionConfig?.fields
}

/**
 * Retrieves the sorting configuration for a specified system collection.
 *
 * The function searches for a matching system collection configuration by its name
 * and returns the associated sorting array. If no configuration is found, it returns null.
 *
 * @param {string} collectionName - The name of the system collection to retrieve sorting
 * for.
 * @returns {string[] | null} An array of sorting keys if collection configuration is found, or null
 * if not.
 */
const getSystemCollectionSort = (collectionName: string): string[] | null => {
	const collectionConfig = SYSTEM_COLLECTIONS.find((c) => c.collection === collectionName)
	return collectionConfig?.sort ?? null
}

/**
 * Removes values that must not be persisted in extracted seed files.
 *
 * @param collectionName - The name of the collection being extracted
 * @param data - The collection data returned by Directus
 * @returns The data prepared for serialization
 */
const filterExtractedData = (collectionName: string, data: SeedItem[]): SeedItem[] => {
	const omitFields: Record<string, string[]> = {
		directus_settings: ['license_key', 'license_token'],
	}

	if (!omitFields[collectionName]) {
		return data
	}

	return data.map((item) => {
		const filteredItem = { ...toSeedRecord(item) }

		for (const field of omitFields[collectionName] ?? []) {
			delete filteredItem[field]
		}

		return filteredItem
	})
}

/**
 * Extracts data from a single collection and writes it to a JSON file.
 *
 * @param collectionName - The name of the collection to extract
 * @param seedsFolder - The folder to write seed files to
 * @param context - Directus hook extension context
 * @param formatJson - Preflighted JSON formatter
 * @returns Promise<boolean> - True if extraction was successful, false otherwise
 */
const extractSingleCollection = async (
	collectionName: string,
	seedsFolder: string,
	context: HookExtensionContext,
	formatJson: JsonFormatter,
): Promise<boolean> => {
	const { logger, services, getSchema, database: knex } = context
	try {
		const schema = await getSchema()
		logger.info(`📦 Extracting collection: ${collectionName}`)

		const service = new services.ItemsService(collectionName, {
			schema,
			knex,
		})

		let data: SeedItem[] = await service.readByQuery({
			limit: -1,
			fields: getSystemCollectionFields(collectionName) ?? ['*'],
			filter: getSystemCollectionFilter(collectionName),
			sort: getSystemCollectionSort(collectionName),
			deep: getDeepQuery(collectionName),
		})
		data = filterExtractedData(collectionName, data)

		// For operations, ensure exported JSON lists dependencies before dependents
		// by sorting operations topologically based on resolve/reject references.
		// This produces cleaner JSON and enables single-pass import in most cases.
		// Circular dependencies are handled gracefully (a warning is logged and the order remains
		// stable).
		if (collectionName === 'directus_operations' && Array.isArray(data) && data.length > 0) {
			data = sortOperationsForKeyConstraints(data)
		}

		if (!data || data.length === 0) {
			logger.info(`⚠️  Collection ${collectionName} is empty, skipping`)
			return true
		}

		const absoluteFilePath = generateSeedFilePath(seedsFolder, collectionName)
		const jsonString = JSON.stringify(data, null, '\t')
		const formattedJson = await formatJson(absoluteFilePath, jsonString)
		await outputFile(absoluteFilePath, formattedJson)

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

/**
 * Converts a readable stream to a Buffer.
 *
 * @param stream - The readable stream to convert
 * @returns Promise<Buffer> - The stream content as a Buffer
 */
const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
	return new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = []

		stream.on('data', (chunk: Buffer) => chunks.push(chunk))
		stream.on('end', () => resolve(Buffer.concat(chunks)))
		stream.on('error', (error: Error) => reject(error))
	})
}

/**
 * Extracts a single asset file and saves it to the assets folder.
 *
 * @param file - The file data from directus_files
 * @param assetsFolder - The folder to save assets to
 * @param context - Directus hook extension context
 * @returns Promise<boolean> - True if extraction was successful, false otherwise
 */
const extractSingleAsset = async (
	file: FileData,
	assetsFolder: string,
	context: HookExtensionContext,
): Promise<boolean> => {
	const { logger, services, getSchema, database: knex } = context
	const schema = await getSchema()

	const assetsService = new services.AssetsService({
		schema,
		knex,
	})

	const destinationPath = path.join(assetsFolder, file.filename_disk)
	logger.trace(`📥 Downloading file: ${file.filename_disk}`)

	try {
		// Fetch the file stream from Directus
		const { stream } = await assetsService.getAsset(file.id)

		// Convert stream to buffer
		const fileBuffer = await streamToBuffer(stream)

		// Write the file buffer to the destination path
		await outputFile(destinationPath, fileBuffer)

		logger.trace(`✅ Downloaded file: ${file.filename_disk}`)
		return true
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		logger.error(`❌ Failed to download file ${file.filename_disk}: ${message}`)
		logger.error(error)
		return false
	}
}

// Main Functions

/**
 * Loops through system collections in order, extracts their data, and writes to JSON files in the
 * specified seeds folder. Some collections are skipped to avoid issues with system collections.
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

	const collectionsToExtract = getFilteredCollections(includeCollections, excludeCollections)

	logger.info(
		`📋 Extracting ${collectionsToExtract.length} collections: ${collectionsToExtract.join(', ')}`,
	)
	logger.trace(`📁 Seeds folder path: ${folders.seeds}`)

	try {
		// Verify the package and its platform-specific native binding before touching seed files.
		const formatJson = await createJsonFormatter()

		// Ensure the seeds directory exists
		await ensureDir(folders.seeds)
		logger.info('📁 Ensured seeds folder exists')

		// and is empty
		if (options.clearExistingSeeds) {
			await emptydir(folders.seeds)
			logger.info('📁 Cleared seeds folder')
		}

		let successCount = 0
		let failureCount = 0

		for (const collectionName of collectionsToExtract) {
			const performanceTracker = createPerformanceTracker()
			const success = await performanceTracker.track(
				`Extract ${collectionName}`,
				async () => {
					return await extractSingleCollection(
						collectionName,
						folders.seeds,
						options.context,
						formatJson,
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
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		logger.error(`❌ Failed to extract seeds: ${message}`)
		logger.error(error)
		throw error
	}
}

/**
 * Extracts all files from the directus_files collection and saves them to the specified asset
 * folder. Ensures the assets folder is cleared before extraction begins.
 *
 * @param options - Configuration options for extraction
 * @param options.folders - Folder configuration containing assets path
 * @param options.context - Directus hook extension context containing services and utilities
 *
 * @returns Resolves after asset extraction completes.
 * @throws Error if required options are missing or services are unavailable
 */
export const extractAssets = async (options: ExtractOptions): Promise<void> => {
	const { logger, getSchema, services, database: knex } = options.context
	logDivider(logger)
	logger.info('📁 Extracting asset files...')

	validateExtractOptions(options)

	const performanceTracker = createPerformanceTracker()

	try {
		await performanceTracker.track('Asset extraction', async () => {
			const schema = await getSchema()

			const filesService = new services.FilesService({
				schema,
				knex,
			})

			logger.trace('📋 Fetching directus_files data')

			const fileData = await filesService.readByQuery({
				limit: -1,
				fields: ['*'],
			})

			if (!fileData || fileData.length === 0) {
				logger.info('📋 No files found in directus_files collection')
				return
			}

			logger.info(
				`📋 Found ${fileData.length} files in directus_files, starting asset extraction...`,
			)

			// Ensure the assets directory exists
			await ensureDir(options.folders.assets)
			logger.info('📁 Ensured assets folder exists')

			// and is empty
			if (options.clearExistingSeeds) {
				await emptydir(options.folders.assets)
				logger.info('📁 Cleared assets folder')
			}

			const results: ExtractionResults = {
				success: [],
				failed: [],
			}

			for (const item of fileData) {
				const file = fileDataSchema.parse(item)
				const success = await extractSingleAsset(
					file,
					options.folders.assets,
					options.context,
				)

				if (success) {
					results.success.push(file.filename_disk)
				} else {
					results.failed.push(file.filename_disk)
				}
			}

			logger.info(
				`✅ Asset extraction complete! ${results.success.length} succeeded, ${results.failed.length} failed`,
			)

			if (results.failed.length > 0) {
				logger.warn('⚠️  Failed files:')
				results.failed.forEach((filename) => logger.warn(` - ${filename}`))
			}
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		logger.error(`❌ Failed to extract assets: ${message}`)
		logger.error(error)
		throw error
	}

	// Log performance data
	performanceTracker.outputFormatPerformanceData(logger)
	logDivider(logger)
}
