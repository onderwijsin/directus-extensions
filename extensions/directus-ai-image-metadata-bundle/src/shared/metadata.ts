import type { GeneratedMetadata, MetadataFile, MetadataOptions } from './options'

import { extname } from 'node:path'

import { attemptSync, isArray, isNonBlankString } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

/**
 * Checks whether a file passes MIME and exact-folder selection.
 * @param file - Persisted file metadata.
 * @param options - Validated selection options.
 * @returns Whether the file is eligible.
 */
export function isSelected(file: MetadataFile, options: MetadataOptions): boolean {
	const mime = file.type?.trim().toLowerCase()
	return (
		Boolean(mime?.startsWith('image/') && options.mimeTypes.includes(mime)) &&
		(!options.includeFolders.length || options.includeFolders.includes(file.folder)) &&
		!options.excludeFolders.includes(file.folder)
	)
}

/**
 * Identifies missing selected fields, treating whitespace and empty tag lists as missing.
 * @param file - Current metadata.
 * @param options - Requested optional fields.
 * @returns Whether at least one requested field is missing.
 */
export function hasMissingMetadata(file: MetadataFile, options: MetadataOptions): boolean {
	return (
		(options.generateAltText && !isNonBlankString(file.description)) ||
		(options.generateTags && !hasTags(file.tags)) ||
		(options.generateFilename && !isNonBlankString(file.filename_download))
	)
}

/**
 * Builds only permitted metadata updates and preserves the original download extension.
 * @param file - Latest file record.
 * @param generated - Schema-validated AI metadata.
 * @param options - Selected fields and overwrite policy.
 * @returns Directus file update payload.
 */
export function createMetadataPatch(
	file: MetadataFile,
	generated: GeneratedMetadata,
	options: MetadataOptions,
) {
	const patch: { description?: string; tags?: string[]; filename_download?: string } = {}
	if (
		options.generateAltText &&
		generated.altText !== undefined &&
		(options.overwriteAltText || !isNonBlankString(file.description))
	)
		patch.description = generated.altText
	if (
		generated.tags !== undefined &&
		options.generateTags &&
		(options.overwriteTags || !hasTags(file.tags))
	)
		patch.tags = [...new Set(generated.tags)]
	if (
		generated.filename !== undefined &&
		options.generateFilename &&
		(options.overwriteFilename || !isNonBlankString(file.filename_download))
	)
		patch.filename_download = generated.filename + extname(file.filename_download ?? '')
	return patch
}

/**
 * Checks for at least one populated tag in either Directus representation.
 * @param tags - Stored tags.
 * @returns Whether tags contain meaningful text.
 */
export function hasTags(tags: MetadataFile['tags']): boolean {
	if (isArray(tags)) return tags.some(isNonBlankString)
	if (!isNonBlankString(tags)) return false

	const result = attemptSync(() => z.array(z.string()).safeParse(JSON.parse(tags)))
	if (result.error === null && result.data?.success)
		return result.data.data.some(isNonBlankString)

	// Non-array JSON and plain-text tags remain meaningful text.
	return true
}

/**
 * Checks whether a selected file needs generation under the field-specific overwrite policy.
 * @param file - Current file metadata.
 * @param options - Generation and overwrite controls.
 * @returns Whether at least one enabled field can be written.
 */
export function needsMetadataUpdate(file: MetadataFile, options: MetadataOptions): boolean {
	return (
		hasMissingMetadata(file, options) ||
		(options.generateAltText && options.overwriteAltText) ||
		(options.generateTags && options.overwriteTags) ||
		(options.generateFilename && options.overwriteFilename)
	)
}
