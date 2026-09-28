import {
	defineExtensionOptionsSchema,
	directusStartupConfig,
	type ExtensionOptionsDefinition,
} from '@onderwijsin/directus-extension-utils/server'

/** Validated environment configuration for the Studio Docs hook. */
export const envSchema = defineExtensionOptionsSchema({
	include: [directusStartupConfig],
	/**
	 * Builds Studio Docs fields with the shared package's Zod runtime.
	 * @param z - The package-owned Zod runtime.
	 * @returns Studio Docs environment fields.
	 */
	options: (z) => ({
		DIRECTUS_DOCS_ENABLED: z.boolean().default(true),
		DIRECTUS_DOCS_SEED_ENABLED: z.boolean().default(true),
		DIRECTUS_DOCS_SEEDING_STRATEGY: z.enum(['override', 'versioning']).default('versioning'),
		DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
		DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
		DIRECTUS_DOCS_MANAGE_POLICY_ENABLED: z.boolean().default(true),
		DIRECTUS_DOCS_VIEW_POLICY_ENABLED: z.boolean().default(true),
	}),
})

/** Output type for the Studio Docs environment configuration. */
export type StudioDocsEnv =
	typeof envSchema extends ExtensionOptionsDefinition<infer Options> ? Options : never
