import {
	aiConfig,
	defineExtensionOptionsSchema,
} from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import { defineMarkdownEditorOptions } from '../shared/env.schema'

const providers = ['openai', 'anthropic', 'google', 'mistral'] as const

/** AI providers implemented by the Markdown Editor endpoint. */
export const editorAiProviderSchema = z.enum(providers)

/** Validates server-only AI provider configuration. */
export const envSchema = defineExtensionOptionsSchema({
	include: [aiConfig],
	/**
	 * Builds endpoint fields with the shared package's Zod runtime.
	 * @param z Package-owned Zod runtime.
	 * @returns Markdown Editor endpoint environment fields.
	 */
	options: (z) => ({
		...defineMarkdownEditorOptions(z),
		// We are overriding the AI provider for the editor specifically, because the shared AI config accepts any string
		// Our extension is only concerned with these specific providers.
		DIRECTUS_EXTENSIONS_AI_PROVIDER: z.enum(providers).optional(),
		EDITOR_AI_PROVIDER: z.enum(providers).optional(),
		// Compose may supply empty optional values; resolution treats trimmed empties as unset.
		EDITOR_AI_MODEL: z.string().trim().min(0).optional(),
		EDITOR_AI_API_KEY: z.string().trim().min(0).optional(),
		EDITOR_AI_BASE_URL: z.url().optional(),
		EDITOR_AI_MAX_CONTENT_LENGTH: z.number().int().positive().default(100_000),
	}),
})
