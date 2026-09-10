import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import { markdownEditorEnvSchema } from '../shared/env.schema'

/** Validates the Markdown Editor hook's startup configuration. */
export const envSchema = directusStartupSchema.safeExtend({
	...markdownEditorEnvSchema.shape,
	MARKDOWN_EDITOR_DOCS_SEED_ENABLED: z.boolean().default(true),
	MARKDOWN_EDITOR_SKILLS_SEED_ENABLED: z.boolean().default(true),
	MARKDOWN_EDITOR_SKILLS_SEEDING_STRATEGY: z
		.enum(['override', 'versioning'])
		.default('versioning'),
	MARKDOWN_EDITOR_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
	MARKDOWN_EDITOR_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
})

/** Validated Markdown Editor hook environment. */
export type MarkdownEditorEnv = z.output<typeof envSchema>
