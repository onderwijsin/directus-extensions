import { schemaChangeSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

/**
 * Validates configuration shared by the magic-links endpoint and hook entries.
 *
 * @returns The shared magic-links environment schema.
 */
export const sharedEnvSchema = schemaChangeSchema.extend({
	MAGIC_LINKS_ENABLED: z.boolean().default(true),
	MAGIC_LINKS_COLLECTION: z
		.string()
		.trim()
		.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
		.default('directus_magic_links'),
})

export type SharedEnv = z.output<typeof sharedEnvSchema>
