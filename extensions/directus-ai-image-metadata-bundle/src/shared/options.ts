import { z } from 'zod'

import { imageMimeTypes } from './image-mime-types'
import { acceptedLanguages } from './languages'

/** Providers supported by the server adapter. */
export const providerSchema = z.enum([
	'openai',
	'anthropic',
	'google',
	'mistral',
	'openai-compatible',
])

const folderListSchema = z
	.array(
		z.object({
			collection: z.literal('directus_folders'),
			key: z.uuid(),
		}),
	)
	.nullable()
	.transform((value) => [...new Set((value ?? []).map(({ key }) => key))])
const mimeSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^image\/[a-z0-9.+-]+$/u)
const mimeListSchema = z
	.union([mimeSchema, z.array(mimeSchema).min(1)])
	.transform((value) => (Array.isArray(value) ? value : [value]))

/** Validates persisted Flow options before side effects. Credentials stay in server configuration. */
const baseOptionsSchema = z.object({
	language: z.preprocess(
		(value) => (value === null || value === '' ? undefined : value),
		z.enum(acceptedLanguages).optional(),
	),
	provider: z.preprocess(
		(value) => (value === null || value === '' ? undefined : value),
		providerSchema.optional(),
	),
	model: z.preprocess(
		(value) => (value === null || value === '' ? undefined : value),
		z.string().trim().min(1).optional(),
	),
	prompt: z.preprocess(
		(value) => (value === null || value === '' ? undefined : value),
		z.string().trim().min(1).optional(),
	),
	mimeTypes: mimeListSchema.default([...imageMimeTypes]),
	includeFolders: folderListSchema.default([]),
	includeRoot: z.boolean().default(false),
	generateAltText: z.boolean().default(true),
	excludeFolders: folderListSchema.default([]),
	generateTags: z.boolean().default(false),
	generateFilename: z.boolean().default(false),
	overwriteAltText: z.boolean().default(false),
	overwriteTags: z.boolean().default(false),
	overwriteFilename: z.boolean().default(false),
})

/**
 * Converts explicit root switches into the existing exact-folder execution contract.
 * @param options - Validated operation options.
 * @returns Options with deduplicated folder IDs and root entries.
 */
function normalizeFolders<T extends z.output<typeof baseOptionsSchema>>(options: T) {
	const includeFolders: (string | null)[] = [...options.includeFolders]
	const excludeFolders: (string | null)[] = [...options.excludeFolders]
	if (options.includeRoot && includeFolders.length) includeFolders.push(null)
	if (!options.includeRoot) excludeFolders.push(null)
	return { ...options, includeFolders, excludeFolders }
}

/** Validated shared options with normalized folder selection. */
export const optionsSchema = baseOptionsSchema.transform(normalizeFolders)

/** Options for processing explicit file IDs, including a templated upload ID. */
export const writerOptionsSchema = baseOptionsSchema
	.extend({
		files: z
			.union([z.uuid(), z.array(z.uuid()).min(1).max(1000)])
			.transform((value) => (Array.isArray(value) ? [...new Set(value)] : [value])),
	})
	.transform(normalizeFolders)

/** Bounded, resumable backfill options. */
export const backfillOptionsSchema = baseOptionsSchema
	.extend({
		missingOnly: z.boolean().default(true),
		maxFiles: z.number().int().min(1).max(1000).default(100),
		offset: z.number().int().nonnegative().default(0),
	})
	.transform(normalizeFolders)

/** Metadata fields read through the Flow's accountability. */
export const fileSchema = z.object({
	id: z.uuid(),
	type: z.string().nullable(),
	folder: z.uuid().nullable(),
	description: z.string().nullable(),
	tags: z.union([z.array(z.string()), z.string()]).nullable(),
	filename_download: z.string().nullable(),
})

export type MetadataOptions = z.output<typeof optionsSchema>
export type MetadataFile = z.output<typeof fileSchema>

/** Validated provider output; filenames are extension-free safe slugs. */
export const metadataSchema = z.object({
	altText: z.string().trim().min(1).max(1000),
	tags: z.array(z.string().trim().min(1).max(100)).max(30),
	filename: z
		.string()
		.trim()
		.max(150)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
})

/**
 * Requests only enabled metadata fields; unrequested provider fields are stripped.
 * @param options - Metadata generation switches.
 * @returns Output schema requiring only the requested fields.
 */
export function createMetadataSchema(
	options: Pick<MetadataOptions, 'generateAltText' | 'generateTags' | 'generateFilename'>,
) {
	if (options.generateAltText) {
		if (options.generateTags && options.generateFilename) return metadataSchema
		if (options.generateTags) return metadataSchema.pick({ altText: true, tags: true })
		if (options.generateFilename) return metadataSchema.pick({ altText: true, filename: true })
		return metadataSchema.pick({ altText: true })
	}
	if (options.generateTags && options.generateFilename)
		return metadataSchema.pick({ tags: true, filename: true })
	if (options.generateTags) return metadataSchema.pick({ tags: true })
	if (options.generateFilename) return metadataSchema.pick({ filename: true })
	return z.object({})
}

/** Validated metadata fields present only when requested. */
export interface GeneratedMetadata {
	altText?: string
	tags?: string[]
	filename?: string
}
