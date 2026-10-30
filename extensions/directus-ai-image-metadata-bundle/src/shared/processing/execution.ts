import type { OperationContext, SchemaOverview, TransformationSet } from '@directus/types'
import type { MetadataEnvironment } from '../configuration/env'

import { InvalidPayloadError, isDirectusError } from '@directus/errors'
import { z } from 'zod'

import {
	MetadataGenerationError,
	MetadataUnavailableError,
	type FileResult,
	type MetadataWriteResult,
	type TransformationDiagnostics,
} from './contracts'
export type { FileResult } from './contracts'

import { type MetadataOptions, type MetadataFile } from '../configuration/options'
import { atStage, ProcessingFailure, settleFile } from '../diagnostics/diagnostics'
import { createFileReader } from '../files/file-reader'
import { readImageBytes } from '../files/image-bytes'
import { diagnosticMimeType } from '../files/image-mime-types'
import { prepareImage } from '../files/image-preparation'
import { hasFocalPointDimensions, matchesFocalPointDimensions } from '../focal-point/focal-point'
import { needsMetadataUpdate, isSelected } from '../metadata/metadata'
import { createMetadataWriter } from '../metadata/metadata-writer'
import { generateMetadata } from '../providers/provider'
import { createProviderResolver } from '../providers/provider-config'
import { createMetadataSystemPrompt } from '../providers/system-prompt'

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
	let resolved: Awaited<ReturnType<typeof resolveProvider>> | undefined

	const { readFile, readPage, readCandidates } = createFileReader(context, schema, options)

	/**
	 * Processes one eligible file, preserving concurrent metadata edits under a row lock.
	 * @param file - Permission-checked metadata.
	 * @param runId - Optional diagnostic run correlation.
	 * @param transformation - Mutable per-file conversion observations.
	 * @returns Updated fields or a skipped result.
	 */
	async function processFile(
		file: MetadataFile,
		runId?: string,
		transformation: TransformationDiagnostics = {
			transformed: false,
			originalMimeType: diagnosticMimeType(file.type) ?? null,
			transformationDurationMs: 0,
		},
	): Promise<MetadataWriteResult> {
		const skipped: MetadataWriteResult = { id: file.id, status: 'skipped', fields: [] }
		if (!isSelected(file, options) || !needsMetadataUpdate(file, options)) return skipped

		provider ??= resolveProvider()
		const config = await atStage('resolve_provider', () => provider ?? resolveProvider())
		resolved = config

		const signal = AbortSignal.timeout(env.AI_METADATA_WRITER_TIMEOUT_MS)
		const prepared = await prepareImage({
			file,
			canonical: options.generateFocalPoint && hasFocalPointDimensions(file),
			signal,
			maxBytes: env.AI_METADATA_WRITER_MAX_IMAGE_BYTES,
			settings: {
				maxSizeBytes: options.maxImageSizeBytes,
				maxDimension: options.maxImageDimension,
				targetDimension: options.targetImageDimension,
			},
			/**
			 * Acquires the planned derivative with the existing per-file deadline.
			 * @param transformation - Optional Directus transformation plan.
			 * @returns Accountable asset stream.
			 */
			acquire: (transformation) => acquireAsset(file.id, signal, transformation),
			logger: context.logger,
			runId,
			diagnostics: transformation,
		})
		const { image, mediaType } = prepared

		const generationOptions = {
			...options,
			generateFocalPoint:
				options.generateFocalPoint &&
				matchesFocalPointDimensions(
					image,
					file,
					prepared.resize ? prepared.resizeDimension : undefined,
				),
		}
		if (!needsMetadataUpdate(file, generationOptions)) return skipped

		const generation = await atStage(
			'generate',
			() =>
				generateMetadata(
					config,
					image,
					mediaType,
					createMetadataSystemPrompt(generationOptions, env),
					signal,
					generationOptions,
				),
			signal,
		)

		return atStage('write_metadata', () => writeMetadata(file, generation))
	}

	/**
	 * Bounds asset acquisition and releases streams arriving after timeout.
	 * @param id - File identifier.
	 * @param signal - Per-file deadline.
	 * @param transformation - Optional single Directus preparation plan.
	 * @returns Acquired asset.
	 */
	async function acquireAsset(
		id: string,
		signal: AbortSignal,
		transformation?: TransformationSet,
	) {
		signal.throwIfAborted()
		const pending = assets.getAsset(id, transformation)
		void pending.then(
			(asset) => {
				if (signal.aborted) asset.stream.destroy()
			},
			() => {
				/* Acquisition rejection is handled by the race. */
			},
		)
		let onAbort: (() => void) | undefined
		const aborted = new Promise<never>((_resolve, reject) => {
			/**
			 * Rejects acquisition when its deadline expires.
			 * @returns Nothing.
			 */
			onAbort = () => reject(new DOMException('Asset acquisition timed out.', 'TimeoutError'))
			signal.addEventListener('abort', onAbort, { once: true })
		})
		try {
			return await Promise.race([pending, aborted])
		} finally {
			if (onAbort) signal.removeEventListener('abort', onAbort)
		}
	}

	/**
	 * Returns independently timed outcomes while retaining fatal configuration failures.
	 * @param config - File selection, correlation, and failure-isolation policy.
	 * @returns Safe per-file outcome.
	 */
	async function processResult(config: {
		id: string
		file?: MetadataFile
		runId: string
		isolate: boolean
	}): Promise<FileResult> {
		const { id, runId, isolate } = config
		let { file } = config
		const transformation: TransformationDiagnostics = {
			transformed: false,
			originalMimeType: diagnosticMimeType(file?.type) ?? null,
			transformationDurationMs: 0,
		}
		return settleFile(
			id,
			async () => {
				const candidate =
					file ??
					(await atStage('read_file', () =>
						readFile(id, (metadata) => {
							transformation.originalMimeType =
								diagnosticMimeType(metadata.type) ?? null
						}),
					))
				if (!candidate) return { id, status: 'skipped', fields: [] }
				file = candidate
				return processFile(candidate, runId, transformation)
			},
			isolate,
			(diagnostic, durationMs) => {
				const details = {
					runId,
					fileId: id,
					folder: file?.folder,
					mime: diagnosticMimeType(file?.type),
					durationMs,
					provider: resolved?.provider,
					model: resolved?.model,
					...diagnostic,
					...transformation,
				}
				context.logger.warn(
					details,
					`Image metadata file failed ${JSON.stringify(details)}`,
				)
			},
			transformation,
		)
	}

	return {
		readFile,
		readPage,
		readCandidates,
		processFile,
		processResult,
		/**
		 * Returns resolved public provider identity after processing.
		 * @returns Resolved configuration, retained internally only.
		 */
		getProvider: () => resolved,
		resolveProvider,
		readImageBytes,
		writeMetadata,
	}
}

/**
 * Preserves Directus codes and captured processing diagnostics while masking unstaged failures.
 * @param error - Unknown service failure.
 * @returns Safe error for the Flow rejection branch.
 */
export function safeMetadataError(error: unknown) {
	if (error instanceof ProcessingFailure && error.diagnostic.stage === 'convert_image')
		return error
	if (error instanceof ProcessingFailure && error.diagnostic.stage === 'resolve_provider')
		return new MetadataUnavailableError({
			reason: 'Check the provider, model, API key, and base URL settings.',
		})
	if (error instanceof ProcessingFailure && error.diagnostic.code === 'INVALID_IMAGE')
		return new InvalidPayloadError({ reason: error.diagnostic.message })
	if (error instanceof ProcessingFailure)
		return new MetadataGenerationError({ error: error.diagnostic })
	return isDirectusError(error) ? error : new MetadataGenerationError({})
}
