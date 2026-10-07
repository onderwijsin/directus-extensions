import type { OperationContext, SchemaOverview } from '@directus/types'
import type { MetadataOptions, MetadataFile, GeneratedMetadata } from './options'

import { fileFields, type FileResult } from './contracts'
import { createMetadataPatch, isSelected } from './metadata'
import { fileSchema } from './options'

/**
 * Builds a metadata writer that rechecks current fields under a row lock.
 * @param context - Accountable Flow context.
 * @param schema - Current schema.
 * @param options - Preservation and selection policy.
 * @returns Transactional metadata writer.
 */
export function createMetadataWriter(
	context: OperationContext,
	schema: SchemaOverview,
	options: MetadataOptions,
) {
	const serviceOptions = {
		schema,
		accountability: context.accountability,
		knex: context.database,
	}
	return async (file: MetadataFile, generated: GeneratedMetadata): Promise<FileResult> => {
		const skipped: FileResult = { id: file.id, status: 'skipped', fields: [] }
		return context.database.transaction(async (transaction) => {
			await transaction('directus_files').where({ id: file.id }).forUpdate().first('id')
			// Bind the service to the transaction so reads retain Flow permissions and field processing.
			const transactionalFiles = new context.services.FilesService({
				...serviceOptions,
				knex: transaction,
			})
			const latest = fileSchema.parse(
				await transactionalFiles.readOne(file.id, { fields: fileFields }),
			)
			if (!isSelected(latest, options)) return skipped
			const patch = createMetadataPatch(latest, generated, options)
			const fields = Object.keys(patch)
			if (!fields.length) return skipped
			// Metadata-only writes use the typed ItemsService; FilesService's special handling
			// applies to physical filename_disk/storage mutations, which this operation never makes.

			// Raw transaction updates would bypass permissions, hooks, revisions, and JSON serialization.
			await new context.services.ItemsService<MetadataFile>('directus_files', {
				...serviceOptions,
				knex: transaction,
			}).updateOne(file.id, patch)
			return { id: file.id, status: 'updated', fields }
		})
	}
}
