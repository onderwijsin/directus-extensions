import {
	defineExtensionOptionsSchema,
	directusStartupConfig,
	type ExtensionOptionsDefinition,
} from '@onderwijsin/directus-extension-utils/server'

import { defineMarkdownEditorOptions } from '../shared/env.schema'

/** Validates the Markdown Editor hook's startup configuration. */
export const envSchema = defineExtensionOptionsSchema({
	include: [directusStartupConfig],
	/**
	 * Builds hook fields with the shared package's Zod runtime.
	 * @param z Package-owned Zod runtime.
	 * @returns Markdown Editor hook environment fields.
	 */
	options: (z) => ({
		...defineMarkdownEditorOptions(z),
		MARKDOWN_EDITOR_DOCS_SEED_ENABLED: z.boolean().default(true),
		MARKDOWN_EDITOR_SKILLS_SEED_ENABLED: z.boolean().default(true),
		MARKDOWN_EDITOR_SKILLS_SEEDING_STRATEGY: z
			.enum(['override', 'versioning'])
			.default('versioning'),
		MARKDOWN_EDITOR_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
		MARKDOWN_EDITOR_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
	}),
})

/** Validated Markdown Editor hook environment. */
export type MarkdownEditorEnv =
	typeof envSchema extends ExtensionOptionsDefinition<infer Options> ? Options : never
