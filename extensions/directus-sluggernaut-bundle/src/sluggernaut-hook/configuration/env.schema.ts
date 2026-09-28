import {
	defineExtensionOptionsSchema,
	directusStartupConfig,
	type ExtensionOptionsDefinition,
} from '@onderwijsin/directus-extension-utils/server'

/** Environment configuration used by Sluggernaut's hook and operation. */
export const envSchema = defineExtensionOptionsSchema({
	include: [directusStartupConfig],
	/**
	 * Builds Sluggernaut fields with the shared package's Zod runtime.
	 * @param z - The package-owned Zod runtime.
	 * @returns Sluggernaut environment fields.
	 */
	options: (z) => {
		const collectionIdentifier = z
			.string()
			.trim()
			.min(1)
			.regex(/^[A-Za-z_][A-Za-z0-9_$]*$/u, 'must be a valid Directus collection identifier')

		return {
			SLUGGERNAUT_ENABLED: z.boolean().default(true),
			SLUGGERNAUT_REDIRECTS_ENABLED: z.boolean().default(false),
			SLUGGERNAUT_NORMALIZE_REDIRECTS: z
				.enum(['trailing-slash', 'no-trailing-slash'])
				.optional(),
			SLUGGERNAUT_THROW_ON_PROCESSING_ERROR: z.boolean().default(true),
			SLUGGERNAUT_REDIRECTS_COLLECTION: collectionIdentifier.default('redirects'),
			SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: z.number().int().positive().default(25),
			SLUGGERNAUT_FIELDS_CACHE_TTL_MS: z.number().positive().default(60_000),
			SLUGGERNAUT_SCHEMA_CHANGES_ENABLED: z.boolean().default(false),
			SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
			SLUGGERNAUT_DOCS_SEED_ENABLED: z.boolean().default(true),
			SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED: z.boolean().default(false),
			SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED: z.boolean().default(false),
		}
	},
})

/** Validated Sluggernaut environment options. */
export type SluggernautEnv =
	typeof envSchema extends ExtensionOptionsDefinition<infer Options> ? Options : never

/** Persistence normalization modes for redirect paths. */
export type RedirectNormalizationMode = SluggernautEnv['SLUGGERNAUT_NORMALIZE_REDIRECTS']
