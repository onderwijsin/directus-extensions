import type { Readable } from 'node:stream'
import type { SeederOptions } from '../env.schema'
import type { PrimaryKey, SeedItem } from '../lib/seedItem'
import type { ServiceAdapter, ServiceAdapterContext } from './ServiceAdapter'

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { getFolderPaths } from '../lib/resolveConfig'
import { toSeedRecord } from '../lib/seedItem'
import { createServiceAdapter } from './ServiceAdapter'

/** Validate the fields consumed by the file-upload boundary without stripping metadata. */
const fileImportSchema = z.looseObject({
	filename_disk: z.string().min(1),
})

/**
 * Preserve the original metadata and optional key for Directus's upload validation.
 * Only filename_disk is consumed locally, so storage and key values stay uncoerced.
 */
interface LegacyFileUploader {
	/** Uploads the original file metadata with Directus runtime validation. */
	uploadOne(
		stream: Readable,
		data: Record<string, unknown>,
		primaryKey?: unknown,
	): Promise<PrimaryKey>
}

/**
 * Uploads one local asset using its seed metadata and optional existing primary key.
 * @param filesService - Directus file service.
 * @param storageDriver - Default storage location.
 * @param item - Untouched seed row.
 * @param env - Directus environment used to locate assets.
 * @returns The uploaded file key.
 */
async function importFile(
	filesService: LegacyFileUploader,
	storageDriver: string,
	item: SeedItem,
	env: SeederOptions,
): Promise<PrimaryKey> {
	const data = toSeedRecord(item)
	if (!data.filename_disk) throw new Error('filename_disk is required for file import')
	const file = fileImportSchema.parse(data)
	const { assetsFolder } = getFolderPaths(env)
	const fullPath = path.join(path.resolve(assetsFolder), file.filename_disk)
	await stat(fullPath)
	const stream = createReadStream(fullPath)
	return filesService.uploadOne(
		stream,
		{ ...data, storage: data.storage ?? storageDriver },
		data.id,
	)
}

/**
 * Creates the file adapter, preserving sequential asset uploads for create and upsert.
 * @param context - Directus services, environment, and schema.
 * @returns File collection operations.
 */
export async function createFilesServiceAdapter(
	context: ServiceAdapterContext,
): Promise<ServiceAdapter> {
	const schema = await context.getSchema()
	const filesService = new context.services.FilesService({ schema })
	const [storageDriver] = context.env.STORAGE_LOCATIONS
	if (!storageDriver) throw new Error('STORAGE_LOCATIONS must contain at least one location')

	/**
	 * Uploads all rows in their original order.
	 * @param data - File seed rows.
	 * @returns Uploaded primary keys.
	 */
	const uploadItems = async (data: SeedItem[]): Promise<PrimaryKey[]> => {
		const results: PrimaryKey[] = []
		for (const item of data) {
			results.push(await importFile(filesService, storageDriver, item, context.env))
		}
		return results
	}

	return createServiceAdapter({
		/**
		 * Reads file metadata through Directus.
		 * @param query - Optional Directus query.
		 * @returns Matching file rows.
		 */
		getItems: (query) => filesService.readByQuery(query ?? {}),
		createItems: uploadItems,
		upsertItems: uploadItems,
		/**
		 * Deletes file rows sequentially.
		 * @param ids - Primary keys to delete.
		 * @returns Deleted primary keys.
		 */
		deleteItems: async (ids) => {
			const results: PrimaryKey[] = []
			for (const id of ids) results.push(await filesService.deleteOne(id))
			return results
		},
	})
}
