import { z } from 'zod'

/**
 * Validates the environment values used by the magic-links endpoint entrypoint.
 *
 * @returns The endpoint environment schema.
 */
export const envSchema = z.object({
	MAGIC_LINKS_ENABLED: z.boolean().default(true),
})
