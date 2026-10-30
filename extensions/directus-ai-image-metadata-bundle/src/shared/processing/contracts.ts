import type { File } from '@directus/types'

import { createError } from '@directus/errors'

export const MetadataUnavailableError = createError<{ reason: string }>(
	'AI_METADATA_WRITER_UNAVAILABLE',
	({ reason }) => `Image metadata provider configuration is invalid. ${reason}`,
	503,
)
export const MetadataGenerationError = createError<{
	error?: import('../diagnostics/diagnostics').FileFailure
}>(
	'AI_METADATA_WRITER_GENERATION_FAILED',
	'Image metadata generation failed. Check the model image-input and structured-output support.',
	502,
)
export const fileFields = [
	'id',
	'type',
	'folder',
	'description',
	'tags',
	'filename_download',
	'filesize',
	'width',
	'height',
	'focal_point_x',
	'focal_point_y',
] satisfies (keyof File)[]

export interface MetadataWriteResult {
	id: string
	status: 'updated' | 'skipped'
	fields: string[]
}

/** Independent preparation triggers; a single image can match several reasons. */
export type ImageTransformationReason =
	| 'filetype'
	| 'dimensions'
	| 'filesize'
	| 'unknown_filesize'
	| 'focal_point'

/** Validated preparation thresholds and resize target for one operation. */
export interface ImagePreparationSettings {
	maxSizeBytes: number
	maxDimension: number
	targetDimension: number
}

/** Source measurements, effective thresholds, and the prepared provider input for one file. */
export interface ImagePreparationDiagnostics {
	reasons: ImageTransformationReason[]
	source: {
		width: number | null
		height: number | null
		sizeBytes: number | null
		mimeType: string | null
	}
	settings: ImagePreparationSettings
	/** Null until acquisition, collection, and any requested WebP validation succeed. */
	output: {
		width: number | null
		height: number | null
		sizeBytes: number
		mimeType: string
	} | null
}

/** Per-file conversion observations, independent of the metadata write outcome. */
export interface TransformationDiagnostics {
	/** Available after a valid preparation plan, including failed transformation attempts. */
	imagePreparation?: ImagePreparationDiagnostics
	/** Present when prepared bytes exceed the soft size threshold, including later provider failures. */
	imageMaxSizeExceeded?: boolean
	transformed: boolean
	originalMimeType: string | null
	transformationDurationMs: number
}

/** Timed file outcome with bounded failure details returned by Flow operations. */
export type FileResult = TransformationDiagnostics &
	(
		| (MetadataWriteResult & { durationMs: number })
		| {
				id: string
				status: 'failed'
				fields: string[]
				durationMs: number
				error: import('../diagnostics/diagnostics').FileFailure
		  }
	)

/** Fatal regeneration diagnostics; restart from the original boundary to avoid omissions. */
export const MetadataRegenerationError = createError<{
	summary: ReturnType<
		ReturnType<typeof import('../diagnostics/run-diagnostics').createRunDiagnostics>['summary']
	>
	results: FileResult[]
	restartAfterId: string | null
}>(
	'AI_METADATA_WRITER_REGENERATION_FAILED',
	'Image metadata regeneration stopped after a fatal failure. Check the run diagnostics before retrying.',
	502,
)
