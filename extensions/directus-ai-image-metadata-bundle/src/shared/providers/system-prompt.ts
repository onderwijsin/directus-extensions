import type { MetadataEnvironment } from '../configuration/env'
import type { MetadataOptions } from '../configuration/options'

import { defaultPrompt } from './provider'

/**
 * Adds the effective metadata language to default or custom system instructions.
 * @param options - Per-operation language and prompt overrides.
 * @param env - Validated global language and prompt defaults.
 * @returns Instructions for localized metadata with safe filename formatting.
 */
export function createMetadataSystemPrompt(
	options: Pick<MetadataOptions, 'language' | 'prompt'>,
	env: Pick<MetadataEnvironment, 'AI_METADATA_WRITER_LANGUAGE' | 'AI_METADATA_WRITER_PROMPT'>,
): string {
	const prompt = options.prompt ?? env.AI_METADATA_WRITER_PROMPT ?? defaultPrompt
	const language = options.language ?? env.AI_METADATA_WRITER_LANGUAGE
	return `${prompt}\n\nMetadata language: ${language}. Write the alt text, tags, and descriptive filename words in ${language}, regardless of the image's language or any conflicting language instruction above. Keep JSON property names unchanged. Transliterate filename words when needed to preserve the lowercase ASCII letters, digits, and hyphens required by the filename format; do not include an extension.`
}
