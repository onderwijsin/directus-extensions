import type {
	FileResult,
	MetadataWriteResult,
	TransformationDiagnostics,
} from '../processing/contracts'

import { createError } from '@directus/errors'
import {
	attempt,
	isDefined,
	isString,
	isBoolean,
	isNumber,
	isFiniteNumber,
	isArray,
	isRecord,
} from '@onderwijsin/directus-extension-utils'
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

/** JSON-safe captured error details. */
export type ErrorData =
	| string
	| number
	| boolean
	| null
	| ErrorData[]
	| { [key: string]: ErrorData }

const capturedErrorSchema = errorSchema.extend({
	message: z.string().optional(),
	cause: z.unknown().optional(),
	lastError: z.unknown().optional(),
	text: z.unknown().optional(),
	value: z.unknown().optional(),
	responseBody: z.unknown().optional(),
	finishReason: z.string().optional(),
	issues: z.unknown().optional(),
})

/**
 * Copies bounded JSON data, excluding credential and request fields.
 * @param value - Upstream diagnostic or provider output.
 * @param depth - Current nesting depth.
 * @param seen - Objects already visited on this branch.
 * @returns Serializable diagnostic data.
 */
function captureData(value: unknown, depth = 0, seen = new Set<unknown>()): ErrorData {
	if (value === null || value === undefined) return null
	if (isString(value)) return value.length > 16000 ? `${value.slice(0, 16000)}[truncated]` : value
	if (isBoolean(value)) return value
	if (isNumber(value)) return isFiniteNumber(value) ? value : String(value)
	if (typeof value === 'bigint' || typeof value === 'symbol') return String(value)
	if (!isRecord(value) && !isArray(value)) return '[unavailable]'
	if (seen.has(value)) return '[circular]'
	if (depth >= 8) return '[truncated]'
	const visited = new Set(seen).add(value)
	if (isArray(value))
		return value.slice(0, 100).map((item) => captureData(item, depth + 1, visited))
	const parsed =
		value instanceof Error
			? capturedErrorSchema.safeParse(value)
			: z.record(z.string(), z.unknown()).safeParse(value)
	if (!parsed.success) return '[unavailable]'
	const output: Record<string, ErrorData> = {}
	for (const [key, item] of Object.entries(parsed.data).slice(0, 100)) {
		if (
			/api.?key|authorization|password|secret|token|cookie|headers|request|prompt|instructions|image|stack/iu.test(
				key,
			)
		)
			continue
		if (item !== undefined) output[key] = captureData(item, depth + 1, visited)
	}
	return output
}

/**
 * Finds validation diagnostics through SDK cause and retry wrappers.
 * @param error - Captured failure.
 * @param seen - Previously visited wrappers.
 * @returns Formatted validation errors and machine-readable issues, when present.
 */
function validationDetails(
	error: unknown,
	seen = new Set<unknown>(),
): { validation?: string; issues?: ErrorData } {
	if (seen.has(error) || seen.size >= 8) return {}
	seen.add(error)
	if (error instanceof z.ZodError)
		return { validation: z.prettifyError(error), issues: captureData(error.issues) }
	const parsed = capturedErrorSchema.safeParse(error)
	if (!parsed.success) return {}
	return validationDetails(parsed.data.cause ?? parsed.data.lastError, seen)
}

/** Stable classification with optional captured upstream details. */
export interface FileFailure {
	stage: FailureStage
	code: string
	retryable: boolean
	httpStatus?: number
	message: string
	raw?: ErrorData
	validation?: string
	issues?: ErrorData
}

type FailureClassification = Pick<FileFailure, 'stage' | 'code' | 'retryable' | 'message'>
type FailureDetails = z.output<typeof errorSchema> | undefined

/**
 * Builds a stable classification independently of captured upstream data.
 * @param stage - Boundary that failed.
 * @param code - Public failure code.
 * @param message - Public failure message.
 * @param retryable - Whether retrying this boundary may succeed.
 * @returns Stable failure classification.
 */
function failure(
	stage: FailureStage,
	code: string,
	message: string,
	retryable = false,
): FailureClassification {
	return { stage, code, message, retryable }
}

/**
 * Classifies provider HTTP and output failures after transport failures have been considered.
 * @param error - Unwrapped provider error.
 * @param details - Parsed error identity.
 * @param httpStatus - Upstream HTTP status.
 * @returns Provider classification, or undefined when no specific rule matches.
 */
function classifyProviderFailure(
	error: unknown,
	details: FailureDetails,
	httpStatus: number | undefined,
): FailureClassification | undefined {
	if (httpStatus === 429)
		return failure(
			'generate',
			'PROVIDER_RATE_LIMITED',
			'AI provider rate limit exceeded.',
			true,
		)
	if (isDefined(httpStatus) && httpStatus >= 500)
		return failure(
			'generate',
			'PROVIDER_UNAVAILABLE',
			'AI provider is temporarily unavailable.',
			true,
		)
	if (isDefined(httpStatus) && httpStatus >= 400)
		return failure('generate', 'PROVIDER_REJECTED', 'AI provider rejected the request.')
	if (
		error instanceof z.ZodError ||
		details?.name === 'AI_NoObjectGeneratedError' ||
		details?.name === 'AI_NoOutputGeneratedError'
	)
		return failure('generate', 'INVALID_OUTPUT', 'AI provider returned invalid metadata.')
	return undefined
}

/**
 * Applies transport rules first, then provider rules, then boundary-specific defaults.
 * @param stage - Boundary that failed.
 * @param error - Error after unwrapping retries.
 * @param details - Parsed error identity.
 * @param httpStatus - Upstream HTTP status.
 * @returns Stable classification in the existing precedence order.
 */
function classifyBoundaryFailure(
	stage: FailureStage,
	error: unknown,
	details: FailureDetails,
	httpStatus: number | undefined,
): FailureClassification {
	switch (details?.name) {
		case 'AbortError':
			return failure('shutdown', 'RUN_ABORTED', 'Image metadata execution was aborted.')
		case 'TimeoutError':
			return failure(
				stage,
				stage === 'convert_image' ? 'IMAGE_TRANSFORM_TIMEOUT' : 'TIMEOUT',
				'Image metadata processing timed out.',
				stage !== 'write_metadata' && stage !== 'convert_image',
			)
	}

	if (
		isString(details?.code) &&
		['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(details.code)
	)
		return failure(
			stage,
			'CONNECTION_FAILED',
			'An upstream connection failed.',
			stage === 'generate' || stage === 'read_asset' || stage === 'read_bytes',
		)

	switch (stage) {
		case 'generate':
			return (
				classifyProviderFailure(error, details, httpStatus) ??
				failure(stage, 'PROVIDER_FAILED', 'Image metadata processing failed.')
			)
		case 'convert_image':
			return failure(stage, 'IMAGE_TRANSFORM_FAILED', 'Image metadata processing failed.')
		case 'resolve_provider':
			return failure(
				stage,
				'PROVIDER_CONFIGURATION_INVALID',
				'AI provider configuration could not be resolved.',
			)
		case 'read_file':
			if (httpStatus === 403 || httpStatus === 404 || details?.code === 'FORBIDDEN')
				return failure(stage, 'FILE_INACCESSIBLE', 'File is unavailable or inaccessible.')
			break
		case 'read_bytes':
			if (details?.code === 'INVALID_PAYLOAD')
				return failure(
					stage,
					'INVALID_IMAGE',
					'Image is empty, invalid, or exceeds the byte limit.',
				)
			break
	}
	return failure(stage, `${stage.toUpperCase()}_FAILED`, 'Image metadata processing failed.')
}

/**
 * Classifies failures and captures underlying error details without request configuration.
 * @param stage - Boundary that failed.
 * @param error - Untrusted upstream error.
 * @returns Stable classification with bounded captured details.
 */
export function classifyFailure(stage: FailureStage, error: unknown): FileFailure {
	const captured = capturedErrorSchema.safeParse(error)
	const raw = captured.success ? captureData(captured.data) : captureData(error)
	const validation = validationDetails(error)

	if (RetryError.isInstance(error)) error = error.lastError
	const parsed = errorSchema.safeParse(error)
	const details = parsed.success ? parsed.data : undefined
	const httpStatus = details?.statusCode ?? details?.status

	return {
		...classifyBoundaryFailure(stage, error, details, httpStatus),
		...(isDefined(httpStatus) ? { httpStatus } : {}),
		...(error != null ? { raw } : {}),
		...validation,
	}
}

/** Carries classified and captured diagnostics across processing boundaries. */
export class ProcessingFailure extends createError<FileFailure>(
	'AI_METADATA_WRITER_PROCESSING_FAILED',
	({ message }) => message,
	502,
) {
	public diagnostic: FileFailure
	/**
	 * Creates a classified boundary error.
	 * @param diagnostic - Classification and captured upstream details.
	 */
	public constructor(diagnostic: FileFailure) {
		super(diagnostic)
		this.diagnostic = diagnostic
	}
}

/**
 * Captures an execution boundary with bounded upstream diagnostics.
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
 * @param failed - Failure observer used for correlated logging.
 * @param transformation - Per-file conversion state, retained even when later processing fails.
 * @returns Timed file outcome.
 */
export async function settleFile(
	id: string,
	action: () => Promise<MetadataWriteResult>,
	isolate: boolean,
	failed: (error: FileFailure, durationMs: number) => void,
	transformation: TransformationDiagnostics = {
		transformed: false,
		originalMimeType: null,
		transformationDurationMs: 0,
	},
): Promise<FileResult> {
	const started = performance.now()
	const result = await attempt(action)
	const durationMs = performance.now() - started

	if (result.data !== null) return { ...result.data, durationMs, ...transformation }

	const diagnostic =
		result.error instanceof ProcessingFailure
			? result.error.diagnostic
			: classifyFailure('read_file', result.error)
	failed(diagnostic, durationMs)

	if (!isolate || diagnostic.stage === 'resolve_provider' || diagnostic.stage === 'shutdown')
		throw new ProcessingFailure(diagnostic)

	return { id, status: 'failed', fields: [], durationMs, error: diagnostic, ...transformation }
}
