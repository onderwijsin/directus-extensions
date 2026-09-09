import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

/** Validates the Markdown Editor hook's startup configuration. */
export const envSchema = directusStartupSchema.safeExtend({
	MARKDOWN_EDITOR_ENABLED: z.boolean().default(true),
	MARKDOWN_EDITOR_DOCS_SEED_ENABLED: z.boolean().default(true),
})
