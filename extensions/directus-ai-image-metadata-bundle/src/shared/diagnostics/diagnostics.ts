import type { FileResult, MetadataWriteResult } from '../processing/contracts'

import { createError } from '@directus/errors'
import { attempt, isDefined } from '@onderwijsin/directus-extension-utils'
import { RetryError } from 'ai'
import { z } from 'zod'

/** Execution boundaries with stable public names. */
export type FailureStage =
	| 'validate_options'
	| 'enumerate'
	| 'shutdown'
	| 'read_file'
	| 'resolve_provider'
	| 'read_asset'
	| 'read_bytes'
	| 'convert_image'
	| 'generate'
	| 'write_metadata'

const errorSchema = z.object({
	statusCode: z.number().int().min(100).max(599).optional(),
	status: z.number().int().min(100).max(599).optional(),
	code: z.union([z.string(), z.number()]).optional(),
	name: z.string().optional(),
})

/** Sanitized diagnostic containing only allowlisted values. */
export interface FileFailure {
	stage: FailureStage
	code: string
	retryable: boolean
	httpStatus?: number
	message: string
}

/**
 * Classifies failures without copying upstream messages or payloads.
 * @param stage - Boundary that failed.
 * @param error - Untrusted upstream error.
 * @returns Safe public diagnostic.
 */
export function classifyFailure(stage: FailureStage, error: unknown): FileFailure {
	if (RetryError.isInstance(error)) error = error.lastError
	const parsed = errorSchema.safeParse(error)
	const details = parsed.success ? parsed.data : undefined
	const httpStatus = details?.statusCode ?? details?.status
	let code =
		stage === 'generate'
			? 'PROVIDER_FAILED'
			: stage === 'convert_image'
				? 'IMAGE_TRANSFORM_FAILED'
				: `${stage.toUpperCase()}_FAILED`
	let retryable = false
	let message = 'Image metadata processing failed.'
	if (details?.name === 'AbortError') {
		stage = 'shutdown'
		code = 'RUN_ABORTED'
		message = 'Image metadata execution was aborted.'
	} else if (details?.name === 'TimeoutError') {
		code = stage === 'convert_image' ? 'IMAGE_TRANSFORM_TIMEOUT' : 'TIMEOUT'
		retryable = stage !== 'write_metadata' && stage !== 'convert_image'
		message = 'Image metadata processing timed out.'
	} else if (
		details?.code === 'ECONNRESET' ||
		details?.code === 'ETIMEDOUT' ||
		details?.code === 'ECONNREFUSED'
	) {
		code = 'CONNECTION_FAILED'
		retryable = stage === 'generate' || stage === 'read_asset' || stage === 'read_bytes'
		message = 'An upstream connection failed.'
	} else if (stage === 'generate' && httpStatus === 429) {
		code = 'PROVIDER_RATE_LIMITED'
		retryable = true
		message = 'AI provider rate limit exceeded.'
	} else if (stage === 'generate' && isDefined(httpStatus) && httpStatus >= 500) {
		code = 'PROVIDER_UNAVAILABLE'
		retryable = true
		message = 'AI provider is temporarily unavailable.'
	} else if (stage === 'generate' && isDefined(httpStatus) && httpStatus >= 400) {
		code = 'PROVIDER_REJECTED'
		message = 'AI provider rejected the request.'
	} else if (
		stage === 'generate' &&
		(error instanceof z.ZodError ||
			details?.name === 'AI_NoObjectGeneratedError' ||
			details?.name === 'AI_NoOutputGeneratedError')
	) {
		code = 'INVALID_OUTPUT'
		message = 'AI provider returned invalid metadata.'
	} else if (stage === 'resolve_provider') {
		code = 'PROVIDER_CONFIGURATION_INVALID'
		message = 'AI provider configuration could not be resolved.'
	} else if (
		stage === 'read_file' &&
		(httpStatus === 403 || httpStatus === 404 || details?.code === 'FORBIDDEN')
	) {
		code = 'FILE_INACCESSIBLE'
		message = 'File is unavailable or inaccessible.'
	} else if (stage === 'read_bytes' && details?.code === 'INVALID_PAYLOAD') {
		code = 'INVALID_IMAGE'
		message = 'Image is empty, invalid, or exceeds the byte limit.'
	}
	return { stage, code, retryable, ...(isDefined(httpStatus) ? { httpStatus } : {}), message }
}

/** Carries sanitized diagnostics across processing boundaries. */
export class ProcessingFailure extends createError<FileFailure>(
	'AI_METADATA_WRITER_PROCESSING_FAILED',
	({ message }) => message,
	502,
) {
	public diagnostic: FileFailure
	/**
	 * Creates a safe boundary error.
	 * @param diagnostic - Sanitized classification.
	 */
	public constructor(diagnostic: FileFailure) {
		super(diagnostic)
		this.diagnostic = diagnostic
	}
}

/**
 * Captures an execution boundary without preserving arbitrary upstream data.
 * @param stage - Current processing stage.
 * @param action - Work at that boundary.
 * @param signal - Optional deadline used to distinguish timeout from shutdown.
 * @returns Boundary result.
 */
export async function atStage<T>(
	stage: FailureStage,
	action: () => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	const result = await attempt(async () => ({ value: await action() }))
	if (result.data === null) {
		if (result.error instanceof ProcessingFailure) throw result.error
		throw new ProcessingFailure(
			classifyFailure(stage, signal?.aborted ? signal.reason : result.error),
		)
	}
	return result.data.value
}

/**
 * Times and isolates one file while preserving run-fatal failures.
 * @param id - File identifier.
 * @param action - Staged file processing.
 * @param isolate - Whether ordinary file failures should resolve.
 * @param failed - Safe failure observer used for correlated logging.
 * @returns Timed file outcome.
 */
export async function settleFile(
	id: string,
	action: () => Promise<MetadataWriteResult>,
	isolate: boolean,
	failed: (error: FileFailure, durationMs: number) => void,
): Promise<FileResult> {
	const started = performance.now()
	const result = await attempt(action)
	const durationMs = performance.now() - started
	if (result.data !== null) return { ...result.data, durationMs }
	const diagnostic =
		result.error instanceof ProcessingFailure
			? result.error.diagnostic
			: classifyFailure('read_file', result.error)
	failed(diagnostic, durationMs)
	if (!isolate || diagnostic.stage === 'resolve_provider' || diagnostic.stage === 'shutdown')
		throw new ProcessingFailure(diagnostic)
	return { id, status: 'failed', fields: [], durationMs, error: diagnostic }
}
