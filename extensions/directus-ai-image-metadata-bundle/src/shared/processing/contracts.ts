import type { File } from '@directus/types'

import { createError } from '@directus/errors'

export const MetadataUnavailableError = createError<{ reason: string }>(
	'AI_METADATA_WRITER_UNAVAILABLE',
	({ reason }) => `Image metadata provider configuration is invalid. ${reason}`,
	503,
)
export const MetadataGenerationError = createError(
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
] satisfies (keyof File)[]

export interface MetadataWriteResult {
	id: string
	status: 'updated' | 'skipped'
	fields: string[]
}

/** Per-file conversion observations, independent of the metadata write outcome. */
export interface TransformationDiagnostics {
	transformed: boolean
	originalMimeType: string | null
	transformationDurationMs: number
}

/** Timed, sanitized file outcome returned by Flow operations. */
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
