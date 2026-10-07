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

const folderSchema = z.uuid().nullable()
const folderListSchema = z
	.union([folderSchema, z.array(folderSchema)])
	.transform((value) => (Array.isArray(value) ? value : [value]))
const mimeSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^image\/[a-z0-9.+-]+$/u)
const mimeListSchema = z
	.union([mimeSchema, z.array(mimeSchema).min(1)])
	.transform((value) => (Array.isArray(value) ? value : [value]))

/** Validates persisted Flow options before side effects. Credentials stay in server configuration. */
export const optionsSchema = z.object({
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
	excludeFolders: folderListSchema.default([]),
	generateTags: z.boolean().default(false),
	generateFilename: z.boolean().default(false),
	overwriteAltText: z.boolean().default(false),
	overwriteTags: z.boolean().default(false),
	overwriteFilename: z.boolean().default(false),
})

/** Options for processing explicit file IDs, including a templated upload ID. */
export const writerOptionsSchema = optionsSchema.extend({
	files: z
		.union([z.uuid(), z.array(z.uuid()).min(1).max(1000)])
		.transform((value) => (Array.isArray(value) ? [...new Set(value)] : [value])),
})

/** Bounded, resumable backfill options. */
export const backfillOptionsSchema = optionsSchema.extend({
	missingOnly: z.boolean().default(true),
	maxFiles: z.number().int().min(1).max(1000).default(100),
	offset: z.number().int().nonnegative().default(0),
})

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
 * Requests only enabled optional fields; unrequested provider fields are stripped.
 * @param options - Optional metadata generation switches.
 * @returns Output schema requiring only the requested fields.
 */
export function createMetadataSchema(
	options: Pick<MetadataOptions, 'generateTags' | 'generateFilename'>,
) {
	if (options.generateTags && options.generateFilename) return metadataSchema
	if (options.generateTags) return metadataSchema.omit({ filename: true })
	if (options.generateFilename) return metadataSchema.omit({ tags: true })
	return metadataSchema.pick({ altText: true })
}

/** Validated alt text with optional fields present only when requested. */
export interface GeneratedMetadata {
	altText: string
	tags?: string[]
	filename?: string
}
