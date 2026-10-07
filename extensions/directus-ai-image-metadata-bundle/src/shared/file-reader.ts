import type { OperationContext, SchemaOverview, Filter } from '@directus/types'

import { z } from 'zod'

import { fileFields } from './contracts'
import { fileSchema, type MetadataOptions } from './options'

/**
 * Builds accountable metadata readers.
 * @param context - Flow services and database.
 * @param schema - Current schema.
 * @param options - Selection filters.
 * @returns Explicit-file and paged readers.
 */
export function createFileReader(
	context: OperationContext,
	schema: SchemaOverview,
	options: MetadataOptions,
) {
	const files = new context.services.FilesService({
		schema,
		accountability: context.accountability,
		knex: context.database,
	})
	/**
	 * Reads a file through the Flow's permission context.
	 * @param id - File UUID.
	 * @returns Validated file metadata.
	 */
	async function readFile(id: string) {
		return fileSchema.parse(await files.readOne(id, { fields: fileFields }))
	}

	/**
	 * Reads a bounded ID-sorted page without filtering on mutable metadata.
	 * @param offset - Number of matching files already scanned.
	 * @param limit - Maximum rows to read.
	 * @returns Permission-filtered image records.
	 */
	async function readPage(offset: number, limit: number) {
		const included: Filter[] = options.includeFolders.map((folder) => ({
			folder: folder === null ? { _null: true } : { _eq: folder },
		}))
		const excluded: Filter[] = options.excludeFolders.map((folder): Filter =>
			folder === null
				? { folder: { _nnull: true } }
				: { _or: [{ folder: { _null: true } }, { folder: { _neq: folder } }] },
		)
		const filter: Filter = {
			_and: [
				{ type: { _in: options.mimeTypes } },
				...(included.length ? [{ _or: included }] : []),
				...excluded,
			],
		}
		return z.array(fileSchema).parse(
			await files.readByQuery({
				fields: fileFields,
				filter,
				sort: ['id'],
				offset,
				limit,
			}),
		)
	}
	return { readFile, readPage }
}
