import type { OperationContext, SchemaOverview } from '@directus/types'
import type { MetadataEnvironment } from './env'

import { InvalidPayloadError, isDirectusError } from '@directus/errors'
import { z } from 'zod'

import {
	MetadataGenerationError,
	MetadataUnavailableError,
	type FileResult,
	type MetadataWriteResult,
} from './contracts'
export type { FileResult } from './contracts'

import { atStage, ProcessingFailure, settleFile } from './diagnostics'
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
	let resolved: Awaited<ReturnType<typeof resolveProvider>> | undefined

	const { readFile, readPage, readCandidates } = createFileReader(context, schema, options)

	/**
	 * Processes one eligible file, preserving concurrent metadata edits under a row lock.
	 * @param file - Permission-checked metadata.
	 * @returns Updated fields or a skipped result.
	 */
	async function processFile(file: MetadataFile): Promise<MetadataWriteResult> {
		const skipped: MetadataWriteResult = { id: file.id, status: 'skipped', fields: [] }
		if (!isSelected(file, options) || !needsMetadataUpdate(file, options)) return skipped
		provider ??= resolveProvider()
		const config = await atStage('resolve_provider', () => provider ?? resolveProvider())
		resolved = config
		const signal = AbortSignal.timeout(env.AI_METADATA_WRITER_TIMEOUT_MS)
		const asset = await atStage('read_asset', () => acquireAsset(file.id, signal))
		const image = await atStage(
			'read_bytes',
			() => readImageBytes(asset.stream, signal, env.AI_METADATA_WRITER_MAX_IMAGE_BYTES),
			signal,
		)
		const generation = await atStage(
			'generate',
			() =>
				generateMetadata(
					config,
					image,
					file.type?.trim().toLowerCase() ?? '',
					createMetadataSystemPrompt(options, env),
					signal,
					options,
				),
			signal,
		)
		return atStage('write_metadata', () => writeMetadata(file, generation))
	}

	/**
	 * Bounds asset acquisition and releases streams arriving after timeout.
	 * @param id - File identifier.
	 * @param signal - Per-file deadline.
	 * @returns Acquired asset.
	 */
	async function acquireAsset(id: string, signal: AbortSignal) {
		signal.throwIfAborted()
		const pending = assets.getAsset(id)
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
		return settleFile(
			id,
			async () => {
				const candidate = file ?? (await atStage('read_file', () => readFile(id)))
				file = candidate
				return processFile(candidate)
			},
			isolate,
			(diagnostic, durationMs) => {
				const details = {
					runId,
					fileId: id,
					folder: file?.folder,
					mime: file?.type,
					durationMs,
					provider: resolved?.provider,
					model: resolved?.model,
					...diagnostic,
				}
				context.logger.warn(
					details,
					`Image metadata file failed ${JSON.stringify(details)}`,
				)
			},
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
 * Preserves Directus errors while masking unexpected internal details.
 * @param error - Unknown service failure.
 * @returns Safe error for the Flow rejection branch.
 */
export function safeMetadataError(error: unknown) {
	if (error instanceof ProcessingFailure && error.diagnostic.stage === 'resolve_provider')
		return new MetadataUnavailableError({
			reason: 'Check the provider, model, API key, and base URL settings.',
		})
	if (error instanceof ProcessingFailure && error.diagnostic.code === 'INVALID_IMAGE')
		return new InvalidPayloadError({ reason: error.diagnostic.message })
	return isDirectusError(error) && !(error instanceof ProcessingFailure)
		? error
		: new MetadataGenerationError()
}
