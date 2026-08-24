import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

const collectionIdentifier = z
	.string()
	.trim()
	.min(1)
	.regex(/^[A-Za-z_][A-Za-z0-9_$]*$/u, 'must be a valid Directus collection identifier')

/** Environment configuration used by Sluggernaut's hook and operation. */
export const envSchema = directusStartupSchema.safeExtend({
	SLUGGERNAUT_ENABLED: z.boolean().default(true),
	SLUGGERNAUT_REDIRECTS_ENABLED: z.boolean().default(false),
	SLUGGERNAUT_THROW_ON_PROCESSING_ERROR: z.boolean().default(true),
	SLUGGERNAUT_REDIRECTS_COLLECTION: collectionIdentifier.default('redirects'),
	SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: z.number().int().positive().default(25),
	SLUGGERNAUT_FIELDS_CACHE_TTL_MS: z.number().positive().default(60_000),
	SLUGGERNAUT_SCHEMA_CHANGES_ENABLED: z.boolean().default(false),
	SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
	SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED: z.boolean().default(false),
	SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED: z.boolean().default(false),
	DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
})

/** Validated Sluggernaut environment options. */
export type SluggernautEnv = z.output<typeof envSchema>
