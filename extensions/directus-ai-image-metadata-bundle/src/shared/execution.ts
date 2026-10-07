import type { OperationContext, SchemaOverview } from '@directus/types'
import type { MetadataEnvironment } from './env'

import { InvalidPayloadError, isDirectusError } from '@directus/errors'
import { attempt } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import { MetadataGenerationError, type FileResult } from './contracts'
export type { FileResult } from './contracts'

import { createFileReader } from './file-reader'
import { readImageBytes } from './image-bytes'
import { needsMetadataUpdate, isSelected } from './metadata'
import { createMetadataWriter } from './metadata-writer'
import { type MetadataOptions, type MetadataFile } from './options'
import { generateMetadata } from './provider'
import { createProviderResolver } from './provider-config'
import { createMetadataSystemPrompt } from './system-prompt'

/**
 * Validates external Flow options with safe Directus errors.
 * @param schema - Operation boundary schema.
 * @param input - Persisted or templated options.
 * @returns Validated operation options.
 */
export function parseOperationOptions<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input)
	if (!parsed.success)
		throw new InvalidPayloadError({ reason: 'Invalid image metadata operation options.' })
	return parsed.data
}

/**
 * Creates permission-aware file processing shared by writer and backfill operations.
 * @param context - Flow services, accountability, database, and logger.
 * @param schema - Current Directus schema.
 * @param env - Validated server environment.
 * @param options - Validated metadata options.
 * @returns File reader and metadata processor.
 */
export function createMetadataProcessor(
	context: OperationContext,
	schema: SchemaOverview,
	env: MetadataEnvironment,
	options: MetadataOptions,
) {
	const serviceOptions = {
		schema,
		accountability: context.accountability,
		knex: context.database,
	}
	const writeMetadata = createMetadataWriter(context, schema, options)
	const assets = new context.services.AssetsService(serviceOptions)
	const resolveProvider = createProviderResolver(context, schema, env, options)
	let provider: ReturnType<typeof resolveProvider> | undefined

	const { readFile, readPage } = createFileReader(context, schema, options)

	/**
	 * Processes one eligible file, preserving concurrent metadata edits under a row lock.
	 * @param file - Permission-checked metadata.
	 * @returns Updated fields or a skipped result.
	 */
	async function processFile(file: MetadataFile): Promise<FileResult> {
		const skipped: FileResult = { id: file.id, status: 'skipped', fields: [] }
		if (!isSelected(file, options) || !needsMetadataUpdate(file, options)) return skipped
		provider ??= resolveProvider()
		const config = await provider
		const signal = AbortSignal.timeout(env.AI_METADATA_WRITER_TIMEOUT_MS)
		const asset = await assets.getAsset(file.id)
		const image = await readImageBytes(
			asset.stream,
			signal,
			env.AI_METADATA_WRITER_MAX_IMAGE_BYTES,
		)
		const generation = await attempt(() =>
			generateMetadata(
				config,
				image,
				file.type?.trim().toLowerCase() ?? '',
				createMetadataSystemPrompt(options, env),
				signal,
				options,
			),
		)
		if (generation.data === null) {
			// Raw provider errors can contain credentials, response bodies, and private image data.
			context.logger.warn({ fileId: file.id }, 'Image metadata generation failed')
			throw new MetadataGenerationError()
		}
		return writeMetadata(file, generation.data)
	}

	return { readFile, readPage, processFile, resolveProvider, readImageBytes, writeMetadata }
}

/**
 * Preserves Directus errors while masking unexpected internal details.
 * @param error - Unknown service failure.
 * @returns Safe error for the Flow rejection branch.
 */
export function safeMetadataError(error: unknown) {
	return isDirectusError(error) ? error : new MetadataGenerationError()
}
