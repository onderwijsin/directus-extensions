import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

/** Validated environment configuration for the Studio Docs hook. */
export const envSchema = directusStartupSchema.safeExtend({
	DIRECTUS_DOCS_ENABLED: z.boolean().default(true),
	DIRECTUS_DOCS_SEED_ENABLED: z.boolean().default(true),
	DIRECTUS_DOCS_SEEDING_STRATEGY: z.enum(['override', 'versioning']).default('versioning'),
	DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
	DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
	DIRECTUS_DOCS_MANAGE_POLICY_ENABLED: z.boolean().default(true),
	DIRECTUS_DOCS_VIEW_POLICY_ENABLED: z.boolean().default(true),
})

/** Output type for the Studio Docs environment configuration. */
export type StudioDocsEnv = z.output<typeof envSchema>
