import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

/**
 * Validates configuration shared by the magic-links endpoint and hook entries.
 *
 * @returns The shared magic-links environment schema.
 */
export const sharedEnvSchema = directusStartupSchema.safeExtend({
	MAGIC_LINKS_ENABLED: z.boolean().default(true),
	MAGIC_LINKS_COLLECTION: z
		.string()
		.trim()
		.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
		.refine((value) => !value.startsWith('directus_'), {
			message: 'Collection names may not start with directus_',
		})
		.default('magic_links'),
})

export type SharedEnv = z.output<typeof sharedEnvSchema>
