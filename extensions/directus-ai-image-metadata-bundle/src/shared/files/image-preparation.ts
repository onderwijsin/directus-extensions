import type { Readable } from 'node:stream'
import type { OperationContext, TransformationSet } from '@directus/types'
import type { MetadataFile } from '../configuration/options'
import type {
	ImagePreparationDiagnostics,
	ImagePreparationSettings,
	ImageTransformationReason,
	TransformationDiagnostics,
} from '../processing/contracts'

import { atStage } from '../diagnostics/diagnostics'
import { hasFocalPointDimensions } from '../focal-point/focal-point'
import { readImageBytes } from './image-bytes'
import { diagnosticMimeType } from './image-mime-types'
import { imageTransformFailure } from './image-transform-error'
import { readWebpDimensions } from './webp-dimensions'

/**
 * Plans one optional transformation while preserving acceptable original bytes.
 * @param file - Accountable file metadata.
 * @param canonical - Whether focal generation needs canonical oriented pixels.
 * @param settings - Configured byte-size threshold, dimension threshold, and resize target.
 * @returns Transformation parameters and safe preparation observations.
 */
export function planImagePreparation(
	file: MetadataFile,
	canonical: boolean,
	settings: ImagePreparationSettings,
) {
	if (!hasFocalPointDimensions(file)) throw imageTransformFailure('IMAGE_TRANSFORM_INVALID_INPUT')
	const reasons: ImageTransformationReason[] = []
	const resize = Math.max(file.width ?? 0, file.height ?? 0) > settings.maxDimension
	const resizeDimension = Math.min(settings.targetDimension, settings.maxDimension)
	if (resize) reasons.push('dimensions')
	if (file.filesize === null) reasons.push('unknown_filesize')
	else if (file.filesize > settings.maxSizeBytes) reasons.push('filesize')
	if (file.type === 'image/avif' || file.type === 'image/tiff') reasons.push('filetype')
	if (canonical) reasons.push('focal_point')
	let transformation: TransformationSet | undefined
	if (reasons.length) {
		transformation = {
			transformationParams: {
				// Directus checks every step's output dimensions. Resize before encoding so
				// sources above its output cap can still produce an allowed small derivative.
				...(resize
					? {
							transforms: [
								[
									'resize',
									{
										width: resizeDimension,
										height: resizeDimension,
										fit: 'inside',
										withoutEnlargement: true,
									},
								],
							],
						}
					: {}),
				format: 'webp',
				quality: 80,
			},
		}
	}
	return {
		transformation,
		reasons,
		resize,
		resizeDimension,
		mediaType: transformation ? 'image/webp' : (file.type ?? ''),
		smallImage: Math.min(file.width ?? 0, file.height ?? 0) < 250,
	}
}

/**
 * Prepares bounded private input once and warns if output still exceeds the byte-size threshold.
 * @param input - Accountable acquisition, metadata, hard limits and diagnostic context.
 * @returns Provider bytes and their verified preparation plan.
 */
export async function prepareImage(input: {
	file: MetadataFile
	canonical: boolean
	signal: AbortSignal
	maxBytes: number
	settings: ImagePreparationSettings
	acquire: (transformation?: TransformationSet) => Promise<{ stream: Readable }>
	logger: Pick<OperationContext['logger'], 'debug' | 'info' | 'warn'>
	runId?: string
	diagnostics: TransformationDiagnostics
}) {
	const { file, signal, diagnostics, logger } = input

	// Decide from file metadata before opening a stream. All preparation reasons share one
	// transformation plan; an undefined transformation means the original bytes can pass through.
	const plan = await atStage(
		'convert_image',
		() => Promise.resolve(planImagePreparation(file, input.canonical, input.settings)),
		signal,
	)

	// Attach the decision before acquisition so failed derivatives retain their source sizes,
	// effective settings, and every trigger in the eventual per-file result or failure log.
	const preparation: ImagePreparationDiagnostics = {
		reasons: plan.reasons,
		source: {
			width: file.width,
			height: file.height,
			sizeBytes: file.filesize,
			mimeType: diagnosticMimeType(file.type) ?? null,
		},
		settings: { ...input.settings },
		output: null,
	}
	diagnostics.imagePreparation = preparation
	const started = performance.now()
	let image: Buffer
	try {
		// The caller acquires the original or derivative through accountable Directus services,
		// preserving their orientation handling, derivative cache, and the shared file deadline.
		const asset = await atStage(
			plan.transformation ? 'convert_image' : 'read_asset',
			() => input.acquire(plan.transformation),
			signal,
		)

		// This is the hard collection limit, independent of the operation's size threshold.
		// The reader stops and releases the stream when the limit or shared deadline is exceeded.
		image = await atStage(
			'read_bytes',
			() => readImageBytes(asset.stream, signal, Math.min(input.maxBytes, 5_000_000)),
			signal,
		)

		// Directus can bypass a requested transformation. Verify the returned WebP header before
		// labeling bytes as WebP or counting this as a completed transformation.
		const outputDimensions = plan.transformation ? readWebpDimensions(image) : undefined
		if (plan.transformation && !outputDimensions)
			throw imageTransformFailure('IMAGE_TRANSFORM_INVALID_INPUT')
		preparation.output = {
			width: outputDimensions?.width ?? file.width,
			height: outputDimensions?.height ?? file.height,
			sizeBytes: image.byteLength,
			mimeType: plan.mediaType,
		}
		if (plan.transformation) diagnostics.transformed = true
	} finally {
		// Include acquisition, streaming, and validation time even when preparation fails.
		// These observations also survive a later provider failure; pass-through duration stays zero.
		if (plan.transformation) diagnostics.transformationDurationMs = performance.now() - started
	}

	// Record the source, requested changes, and actual output size without logging image content.
	const observations = {
		runId: input.runId,
		fileId: file.id,
		originalMimeType: diagnosticMimeType(file.type),
		originalWidth: file.width,
		originalHeight: file.height,
		originalBytes: file.filesize,
		providerInputMimeType: plan.mediaType,
		transformationReasons: plan.reasons,
		requestedWidth: plan.resize ? plan.resizeDimension : null,
		requestedHeight: plan.resize ? plan.resizeDimension : null,
		quality: plan.transformation ? 80 : null,
		transformed: diagnostics.transformed,
		transformationDurationMs: diagnostics.transformationDurationMs,
		outputBytes: image.byteLength,
		maxSizeBytes: input.settings.maxSizeBytes,
		maxDimension: input.settings.maxDimension,
		targetDimension: input.settings.targetDimension,
		smallImage: plan.smallImage,
		imagePreparation: preparation,
	}

	// Successful transformations must be visible at the normal log level, not only in debug.
	// Keep unchanged originals quiet; embed safe JSON so text log output retains the measurements.
	if (diagnostics.transformed)
		logger.info(observations, `Image metadata input prepared ${JSON.stringify(observations)}`)
	else logger.debug(observations, 'Image metadata input prepared')

	// Exceeding the soft byte-size threshold is observable, but does not block submission or trigger another
	// transformation. The hard limit above still applies, and the flag feeds the run summary.
	if (image.byteLength > input.settings.maxSizeBytes) {
		diagnostics.imageMaxSizeExceeded = true
		const warning = {
			...observations,
			code: 'AI_METADATA_IMAGE_MAX_SIZE_EXCEEDED',
			bytesOverMaxSize: image.byteLength - input.settings.maxSizeBytes,
			submissionContinues: true,
		}
		logger.warn(
			warning,
			`Image metadata input exceeds soft byte-size threshold; submitting without another transformation ${JSON.stringify(warning)}`,
		)
	}

	// Keep the plan with the bytes so the caller can verify the resized focal-point coordinate frame.
	return { image, ...plan }
}
