import { z } from 'zod'

import { markdownEditorEnvSchema } from '../shared/env.schema'

/** Validates server-only AI provider configuration. */
export const envSchema = markdownEditorEnvSchema.extend({
	EDITOR_AI_PROVIDER: z.enum(['openai', 'anthropic', 'google', 'mistral']).optional(),
	EDITOR_AI_MODEL: z.string().trim().min(1).optional(),
	EDITOR_AI_API_KEY: z.string().trim().min(1).optional(),
	EDITOR_AI_BASE_URL: z.url().optional(),
	EDITOR_AI_MAX_CONTENT_LENGTH: z.number().int().positive().default(100_000),
})
