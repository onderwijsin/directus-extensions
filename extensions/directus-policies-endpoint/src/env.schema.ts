import { z } from 'zod'

/**
 * Validates the environment variables used by the policies endpoint.
 *
 * @returns The policies endpoint environment schema.
 */
export const envSchema = z.object({
	POLICIES_ENDPOINT_ENABLED: z.boolean().default(true),
})
