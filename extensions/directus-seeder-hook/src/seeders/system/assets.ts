import type { HookExtensionContext } from '@directus/types'

import path from 'node:path'

import { z } from 'zod'

import { outputFile } from '../../lib/filesystem'
import { createPerformanceTracker } from '../../lib/performanceTracker'
import { seedItemsSchema } from '../../lib/seedItem'

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

/**
 * Extracts all files from the directus_files collection and saves them to the specified asset
 * folder. Output directories are prepared by the shared extraction flow.
 *
 * @param context - Directus hook extension context containing services and utilities.
 * @param assetsFolder - Validated, prepared output directory for binary assets.
 *
 * @returns Resolves after asset extraction completes.
 * @throws Error if asset validation or extraction fails.
 */
export const extractAssets = async (
	context: HookExtensionContext,
	assetsFolder: string,
): Promise<void> => {
	const { logger, getSchema, services, database: knex } = context
	logger.info('-'.repeat(60))
	logger.info('📁 Extracting asset files...')

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
				const success = await extractSingleAsset(file, assetsFolder, context)

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
	logger.info('-'.repeat(60))
}
