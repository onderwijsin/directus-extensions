import type { MetadataEnvironment } from '../configuration/env'
import type { MetadataOptions } from '../configuration/options'

import { focalPointInstructions } from '../focal-point/focal-point'
import { defaultPrompt } from './provider'

/**
 * Composes default or custom instructions with language and enabled focal-point guidance.
 * @param options - Effective per-file generation options and operation overrides.
 * @param env - Validated global language and prompt defaults.
 * @returns Instructions for localized metadata and the requested focal-point output.
 */
export function createMetadataSystemPrompt(
	options: Pick<MetadataOptions, 'language' | 'prompt' | 'generateFocalPoint'>,
	env: Pick<MetadataEnvironment, 'AI_METADATA_WRITER_LANGUAGE' | 'AI_METADATA_WRITER_PROMPT'>,
): string {
	const prompt = options.prompt ?? env.AI_METADATA_WRITER_PROMPT ?? defaultPrompt
	const language = options.language ?? env.AI_METADATA_WRITER_LANGUAGE
	return [
		prompt,
		`Metadata language: ${language}. Write the alt text, tags, and descriptive filename words in ${language}, regardless of the image's language or any conflicting language instruction above. Keep JSON property names unchanged. Transliterate filename words when needed to preserve the lowercase ASCII letters, digits, and hyphens required by the filename format; do not include an extension.`,
		...(options.generateFocalPoint ? [focalPointInstructions] : []),
	].join('\n\n')
}
