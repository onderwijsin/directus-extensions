import { defineExtensionOptionsSchema } from '@onderwijsin/directus-extension-utils/server'

import { defineMarkdownEditorOptions } from '../shared/env.schema'

/**
 * Preprocesses a value by converting empty strings to undefined.
 * @param value The value to preprocess.
 * @returns The preprocessed value, or undefined if the input was an empty string.
 */
const emptyToUndefined = (value: unknown): unknown =>
	typeof value === 'string' && value.trim() === '' ? undefined : value

/** Validates server-only AI provider configuration. */
export const envSchema = defineExtensionOptionsSchema({
	/**
	 * Builds endpoint fields with the shared package's Zod runtime.
	 * @param z Package-owned Zod runtime.
	 * @returns Markdown Editor endpoint environment fields.
	 */
	options: (z) => ({
		...defineMarkdownEditorOptions(z),
		EDITOR_AI_PROVIDER: z.enum(['openai', 'anthropic', 'google', 'mistral']).optional(),
		EDITOR_AI_MODEL: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),

		EDITOR_AI_API_KEY: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),

		EDITOR_AI_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
		EDITOR_AI_MAX_CONTENT_LENGTH: z.number().int().positive().default(100_000),
	}),
})
