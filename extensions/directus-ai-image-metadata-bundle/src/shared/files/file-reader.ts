import type { OperationContext, SchemaOverview, Filter } from '@directus/types'

import { z } from 'zod'

import { fileSchema, type MetadataOptions, type MetadataFile } from '../configuration/options'
import { fileFields } from '../processing/contracts'
import { imageMimeTypes } from './image-mime-types'

const indexWindowSize = 1000
const indexRowsSchema = z.array(z.object({ id: z.uuid() }))

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
	 * @param onRead - Optional observer for accountable metadata, including unsupported explicit files.
	 * @returns Validated image metadata, or null for an unsupported MIME type.
	 */
	async function readFile(id: string, onRead?: (file: MetadataFile) => void) {
		const file = fileSchema.parse(await files.readOne(id, { fields: fileFields }))
		onRead?.(file)
		return imageMimeTypes.includes(file.type ?? '') ? file : null
	}

	/**
	 * Reads an accountable ID-sorted prefetch with optional moving metadata filters.
	 * @param limit - Maximum rows to read.
	 * @param selection - Optional keyset, exclusion and missing-field predicates.
	 * @returns Permission-filtered image records.
	 */
	async function readPage(
		limit: number,
		selection?: {
			missingOnly: boolean
			rangeIds?: string[]
			excludeFiles: string[]
		},
	) {
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
				{ type: { _in: [...imageMimeTypes] } },
				...(included.length ? [{ _or: included }] : []),
				...excluded,
				...(selection?.rangeIds ? [{ id: { _in: selection.rangeIds } }] : []),
				...(selection?.excludeFiles.length
					? [{ id: { _nin: selection.excludeFiles } }]
					: []),
				...(selection?.missingOnly ? [{ _or: missingMetadataFilters(options) }] : []),
			],
		}
		return z.array(fileSchema).parse(
			await files.readByQuery({
				fields: fileFields,
				filter,
				sort: ['id'],
				offset: 0,
				limit,
			}),
		)
	}

	/**
	 * Reads a bounded, selection-scoped ID window after an exclusive cursor.
	 * UUID ordering works in SQL, while Directus UUID filters do not accept _gt.
	 * Metadata and permission filtering remain the responsibility of readPage.
	 * @param afterId - Exclusive ID boundary.
	 * @param excludeFiles - Already fetched or explicitly excluded IDs.
	 * @returns IDs in the window and whether later index rows exist.
	 */
	async function readIndexWindow(afterId: string, excludeFiles: string[]) {
		const query = context
			.database('directus_files')
			.select('id')
			.where('id', '>', afterId)
			.whereNotIn('id', excludeFiles)
			.whereIn('type', [...imageMimeTypes])

		const includedFolders = options.includeFolders.filter((folder) => folder !== null)
		if (options.includeFolders.length) {
			query.where((folders) => {
				folders.whereIn('folder', includedFolders)
				if (options.includeFolders.includes(null)) folders.orWhereNull('folder')
			})
		}

		const excludedFolders = options.excludeFolders.filter((folder) => folder !== null)
		if (options.excludeFolders.includes(null)) query.whereNotNull('folder')
		if (excludedFolders.length) {
			query.where((folders) => {
				folders.whereNull('folder').orWhereNotIn('folder', excludedFolders)
			})
		}

		const rows = indexRowsSchema.parse(await query.orderBy('id').limit(indexWindowSize + 1))
		return {
			ids: rows.slice(0, indexWindowSize).map((row) => row.id),
			hasMore: rows.length > indexWindowSize,
		}
	}

	/**
	 * Reads accountable candidates in ID order without omitting coarse matches before the final ID.
	 * Only an empty page can advance over a verified index window without consuming candidates.
	 * @param afterId - Exclusive stable ID boundary.
	 * @param excludeFiles - Already fetched or explicitly excluded IDs.
	 * @param limit - Prefetch size.
	 * @param missingOnly - Whether to select a superset of enabled missing fields.
	 * @returns Candidates, or a continuation boundary for a verified empty index window.
	 */
	async function readCandidates(
		afterId: string | null,
		excludeFiles: string[],
		limit: number,
		missingOnly: boolean,
	) {
		const window = afterId ? await readIndexWindow(afterId, excludeFiles) : undefined
		if (window && !window.ids.length) return { files: [], nextBoundary: null }

		const selection = { missingOnly, excludeFiles, rangeIds: window?.ids }
		const candidates = await readPage(limit, selection)
		if (candidates.length) return { files: candidates, nextBoundary: null }
		if (!window?.hasMore) return { files: [], nextBoundary: null }

		// Advance only to an accountable, in-scope file; never expose an inaccessible index ID.
		const readable = await readPage(indexWindowSize, { ...selection, missingOnly: false })
		const nextBoundary = readable.at(-1)?.id
		if (!nextBoundary)
			throw new Error('The bounded index window contains no readable selected files.')

		return { files: [], nextBoundary }
	}

	return { readFile, readPage, readCandidates }
}

/**
 * Builds a portable superset of missing metadata, refined in memory before admission.
 * Tags are text with cast-json in Directus; all tag representations require bounded refinement.
 * @param options - Enabled metadata fields.
 * @returns OR predicates excluding ordinary complete descriptions and filenames.
 */
function missingMetadataFilters(options: MetadataOptions): Filter[] {
	const fields = [
		...(options.generateAltText ? ['description'] : []),
		...(options.generateTags ? ['tags'] : []),
		...(options.generateFilename ? ['filename_download'] : []),
	]
	// Every ECMAScript trim whitespace character; meaningful prefixed text is refined in memory.
	const whitespace =
		'\u0009\u000a\u000b\u000c\u000d \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
	return fields.flatMap((field): Filter[] => {
		if (field === 'tags') return [{ tags: { _null: true } }, { tags: { _nnull: true } }]
		return [
			{ [field]: { _empty: true } },
			...Array.from(whitespace, (prefix): Filter => ({
				[field]: { _starts_with: prefix },
			})),
		]
	})
}
