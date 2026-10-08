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

/** Timed, sanitized file outcome returned by Flow operations. */
export type FileResult =
	| (MetadataWriteResult & { durationMs: number })
	| {
			id: string
			status: 'failed'
			fields: string[]
			durationMs: number
			error: import('./diagnostics').FileFailure
	  }
