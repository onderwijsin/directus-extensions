import { isDefined, isNonBlankString, isString } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import { focalPointSchema } from '../focal-point/focal-point'
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
/**
 * Treats absent or blank text as an unset override while preserving invalid types for validation.
 * @param value - Untrusted Flow option.
 * @returns The supplied nonblank value, or undefined for a missing override.
 */
function optionalText(value: unknown) {
	if (!isDefined(value) || value === null) return undefined
	if (isString(value) && !isNonBlankString(value)) return undefined
	return value
}

/** Validates persisted Flow options before side effects. Credentials stay in server configuration. */
const baseOptionsSchema = z.object({
	language: z.preprocess(optionalText, z.enum(acceptedLanguages).optional()),
	provider: z.preprocess(optionalText, providerSchema.optional()),
	model: z.preprocess(optionalText, z.string().trim().min(1).optional()),
	prompt: z.preprocess(optionalText, z.string().trim().min(1).optional()),
	maxImageSizeBytes: z.preprocess(optionalText, z.number().int().positive().safe().optional()),
	// Accept the former option in saved Flows; normalization emits only maxImageSizeBytes.
	targetImageSizeBytes: z.preprocess(optionalText, z.number().int().positive().safe().optional()),
	maxImageDimension: z.preprocess(optionalText, z.number().int().positive().safe().default(1500)),
	targetImageDimension: z.preprocess(
		optionalText,
		z.number().int().positive().safe().default(800),
	),
	// Retired option: accept every saved value, but never use it for selection.
	mimeTypes: z
		.unknown()
		.optional()
		.transform(() => undefined),
	includeFolders: folderListSchema.default([]),
	includeRoot: z.boolean().default(false),
	generateAltText: z.boolean().default(true),
	excludeFolders: folderListSchema.default([]),
	generateTags: z.boolean().default(false),
	generateFilename: z.boolean().default(false),
	generateFocalPoint: z.boolean().default(false),
	overwriteAltText: z.boolean().default(false),
	overwriteTags: z.boolean().default(false),
	overwriteFilename: z.boolean().default(false),
	overwriteFocalPoint: z.boolean().default(false),
})

/**
 * Normalizes exact-folder selection and the former image-size option for execution.
 * @param options - Validated operation options.
 * @returns Current option names with defaults and normalized folder IDs/root entries.
 */
function normalizeOptions<T extends z.output<typeof baseOptionsSchema>>(options: T) {
	const includeFolders: (string | null)[] = [...options.includeFolders]
	const excludeFolders: (string | null)[] = [...options.excludeFolders]
	if (options.includeRoot && includeFolders.length) includeFolders.push(null)
	if (!options.includeRoot) excludeFolders.push(null)
	// Prefer the current option, preserve saved legacy values, and expose only the current name.
	const { targetImageSizeBytes, ...currentOptions } = options
	return {
		...currentOptions,
		maxImageSizeBytes: options.maxImageSizeBytes ?? targetImageSizeBytes ?? 500_000,
		includeFolders,
		excludeFolders,
	}
}

/** Validated shared options with normalized folder selection. */
export const optionsSchema = baseOptionsSchema.transform(normalizeOptions)

/** Options for processing explicit file IDs, including a templated upload ID. */
export const writerOptionsSchema = baseOptionsSchema
	.extend({
		files: z
			.union([z.uuid(), z.array(z.uuid()).min(1).max(1000)])
			.transform((value) => (Array.isArray(value) ? [...new Set(value)] : [value])),
	})
	.transform(normalizeOptions)

/** Bounded, resumable backfill options. */
export const backfillOptionsSchema = baseOptionsSchema
	.extend({
		missingOnly: z.boolean().default(true),
		maxFiles: z.number().int().min(1).max(1000).default(100),
		concurrency: z.number().int().min(1).max(100).default(1),
		afterId: z.preprocess(
			(value) => (value === '' ? null : value),
			z.uuid().nullable().default(null),
		),
		excludeFiles: z
			.array(z.uuid())
			.max(1000)
			.nullable()
			.transform((value) => value ?? [])
			.default([]),
	})
	.strict()
	.transform(normalizeOptions)

/** Metadata fields read through the Flow's accountability. */
export const fileSchema = z.object({
	id: z.uuid(),
	type: z.string().nullable(),
	folder: z.uuid().nullable(),
	description: z.string().nullable(),
	tags: z.union([z.array(z.string()), z.string()]).nullable(),
	filename_download: z.string().nullable(),
	filesize: z
		.union([
			z.number().int().nonnegative().safe(),
			z
				.string()
				.regex(/^\d+$/u)
				.transform(Number)
				.pipe(z.number().int().nonnegative().safe()),
		])
		.nullable()
		.default(null),
	width: z.number().nullable().default(null),
	height: z.number().nullable().default(null),
	focal_point_x: z.number().nullable().default(null),
	focal_point_y: z.number().nullable().default(null),
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
	options: Pick<
		MetadataOptions,
		'generateAltText' | 'generateTags' | 'generateFilename' | 'generateFocalPoint'
	>,
): z.ZodType<GeneratedMetadata> {
	const schema = metadataSchema.extend({ focalPoint: focalPointSchema })
	const fields: Partial<Record<keyof z.output<typeof schema>, true>> = {}
	if (options.generateAltText) fields.altText = true
	if (options.generateTags) fields.tags = true
	if (options.generateFilename) fields.filename = true
	if (options.generateFocalPoint) fields.focalPoint = true
	return schema.pick(fields)
}

/** Validated metadata fields present only when requested. */
export interface GeneratedMetadata {
	altText?: string
	tags?: string[]
	filename?: string
	focalPoint?: z.output<typeof focalPointSchema>
}
