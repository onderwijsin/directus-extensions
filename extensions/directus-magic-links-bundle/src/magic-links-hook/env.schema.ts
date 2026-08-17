import { z } from 'zod'

/**
 * Validates the environment values used by the magic-links hook entrypoint.
 *
 * @returns The hook environment schema.
 */
export const envSchema = z.object({
	MAGIC_LINKS_ENABLED: z.boolean().default(true),
})
