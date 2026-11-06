import type { HookExtensionContext } from '@directus/types'
import type { ResolvedCollectionManagement } from '../../lib/collectionManagement'
import type { SeederConfig } from '../../lib/config'
import type { SeedItem } from '../../lib/seedItem'
import type { SystemCollectionConfig } from './config.schema'

import path from 'node:path'

import { z } from 'zod'

import { getManagementFilters } from '../../lib/collectionManagement'
import { outputFile, prepareExtractionDirectories } from '../../lib/filesystem'
import { createPerformanceTracker } from '../../lib/performanceTracker'
import { resolveCollectionManagement } from '../../lib/resolveManagement'
import { seedItemsSchema, toSeedRecord } from '../../lib/seedItem'
import { getCompatibleExtractionFields } from './compatibility'
import { SYSTEM_COLLECTIONS_ORDER } from './config'
import { sortOperationsForKeyConstraints } from './data'
import { getSystemCollections } from './resolveConfig'

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
const fileDataSchema = z.looseObject({
	id: z.string(),
	filename_disk: z
		.string()
		.min(1)
		.refine((filename) => filename !== '.' && filename !== '..' && !/[\\/\0]/u.test(filename), {
			error: 'Asset filename_disk must be a single filename inside the assets directory',
		}),
})
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
 * @param collectionsOrder - Effective processing order, retaining the existing selection rules.
 * @returns Filtered array of collection names
 */
export const getFilteredCollections = (
	includeCollections?: unknown[],
	excludeCollections?: unknown[],
	collectionsOrder = SYSTEM_COLLECTIONS_ORDER,
): string[] => {
	let collectionsToExtract = [...collectionsOrder].filter(
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
 * Restricts extraction to both the management boundary and the separate extraction filter.
 * @param collection - Validated effective settings.
 * @param management - Resolved numeric or relation selection.
 * @returns Directus filter; import deletion intentionally uses only the management boundary.
 */
const getExtractionFilter = (
	collection: SystemCollectionConfig,
	management?: ResolvedCollectionManagement,
): SystemCollectionConfig['filter'] => {
	const { filter } = collection
	if (!management) return filter
	return { _and: [...(filter ? [filter] : []), ...getManagementFilters(management)] }
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
 * @param collection - Effective settings of the collection to extract
 * @param seedsFolder - The folder to write seed files to
 * @param context - Directus hook extension context
 * @param jsonIndent - Indentation for the extracted JSON
 * @param fieldOverrides - Collections whose consumer fields must be passed unchanged.
 * @param management - Resolved numeric or relation selection.
 * @returns Promise<boolean> - True if extraction was successful, false otherwise
 */
const extractSingleCollection = async (
	collection: SystemCollectionConfig,
	seedsFolder: string,
	context: HookExtensionContext,
	jsonIndent: SeederConfig['jsonIndent'],
	fieldOverrides: SeederConfig['systemFieldOverrides'],
	management?: ResolvedCollectionManagement,
): Promise<boolean> => {
	const { logger, services, getSchema, database: knex } = context
	const collectionName = collection.collection
	try {
		const schema = await getSchema()
		logger.info(`📦 Extracting collection: ${collectionName}`)

		const service = new services.ItemsService(collectionName, {
			schema,
			knex,
		})

		// Like the service adapters, pass validated query data through a plain object. Directus's
		// Filter types omit supported JSON logical predicates and GeoJSON geometry values.
		const query: Record<string, unknown> = {
			limit: -1,
			fields: getCompatibleExtractionFields(collection, schema, fieldOverrides),
			filter:
				management?.type === 'relation' && management.ids.length === 0
					? undefined
					: getExtractionFilter(collection, management),
			sort: collection.sort ?? null,
			deep: collection.deep ?? null,
		}
		let data: SeedItem[] =
			management?.type === 'relation' && management.ids.length === 0
				? []
				: seedItemsSchema.parse(await service.readByQuery(query))
		data = filterExtractedData(collectionName, data)

		// For operations, ensure exported JSON lists dependencies before dependents
		// by sorting operations topologically based on resolve/reject references.
		// This produces cleaner JSON and enables single-pass import in most cases.
		// Circular dependencies are handled gracefully (a warning is logged and the order remains
		// stable).
		if (collectionName === 'directus_operations' && Array.isArray(data) && data.length > 0) {
			data = sortOperationsForKeyConstraints(data)
		}

		const absoluteFilePath = generateSeedFilePath(seedsFolder, collectionName)
		await outputFile(absoluteFilePath, `${JSON.stringify(data, null, jsonIndent)}\n`)

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
 * @param boundaries - Selections snapshotted before cleanup; direct callers resolve them before writes.
 * @returns Resolves after collection extraction completes.
 * @throws Error if required options are missing or invalid
 */
export const extractSeedsFromCollections = async (
	options: ExtractOptions,
	boundaries?: ReadonlyMap<string, ResolvedCollectionManagement>,
): Promise<void> => {
	validateExtractOptions(options)

	const { logger } = options.context
	const { includeCollections, excludeCollections, folders } = options

	const collections = getSystemCollections(options)
	const collectionsToExtract = getFilteredCollections(
		includeCollections,
		excludeCollections,
		collections.map(({ collection }) => collection),
	)

	const management = boundaries ?? (await resolveExtractionManagement(options))

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
						management.get(collectionName),
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
 * Extracts all files from the directus_files collection and saves them to the specified asset
 * folder. Output directories are prepared by the shared extraction flow.
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

			const fileData = seedItemsSchema.parse(
				await filesService.readByQuery({
					limit: -1,
					fields: ['*'],
				}),
			)

			if (fileData.length === 0) {
				logger.info('📋 No files found in directus_files collection')
				return
			}

			logger.info(
				`📋 Found ${fileData.length} files in directus_files, starting asset extraction...`,
			)

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
				`📋 Asset extraction complete: ${results.success.length} succeeded, ${results.failed.length} failed`,
			)

			if (results.failed.length > 0) {
				logger.warn('⚠️  Failed files:')
				results.failed.forEach((filename) => logger.warn(` - ${filename}`))
				throw new Error(`Failed to extract ${results.failed.length} asset(s)`)
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

/**
 * Cleans managed output first, then exports selected JSON and optionally all binary assets.
 * Failures propagate to the CLI or automatic-task logger; partial output can be rerun.
 * @param options - Validated runtime configuration and output locations.
 * @returns Resolves only after every requested export succeeds.
 */
export async function extractSystemData(options: ExtractOptions): Promise<void> {
	validateExtractOptions(options)
	const systemCollections = getSystemCollections(options)
	const boundaries = await resolveExtractionManagement({ ...options, systemCollections })
	let folders: ExtractOptions['folders']
	try {
		folders = await prepareExtractionDirectories(
			options.folders,
			options.jsonOnly,
			options.skipClean,
		)
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		throw new Error(`Failed to prepare extraction output directories: ${message}`, {
			cause: error,
		})
	}
	const prepared = { ...options, folders, systemCollections }
	await extractSeedsFromCollections(prepared, boundaries)
	if (!options.jsonOnly) await extractAssets(prepared)
}

/**
 * Snapshots all selected boundaries before cleanup can remove or extraction can replace source files.
 * @param options - Effective extraction settings and existing Git seed directory.
 * @returns Resolved management for selected collections only.
 */
async function resolveExtractionManagement(
	options: ExtractOptions,
): Promise<Map<string, ResolvedCollectionManagement>> {
	const collections = getSystemCollections(options)
	const selected = getFilteredCollections(
		options.includeCollections,
		options.excludeCollections,
		collections.map(({ collection }) => collection),
	)
	const boundaries = new Map<string, ResolvedCollectionManagement>()
	for (const collection of collections) {
		if (!selected.includes(collection.collection) || !collection.management) continue
		const management =
			collection.management.type === 'relation'
				? await resolveCollectionManagement(
						collection.collection,
						collection.management,
						options.folders.seeds,
						await options.context.getSchema(),
					)
				: collection.management
		boundaries.set(collection.collection, management)
	}
	return boundaries
}
