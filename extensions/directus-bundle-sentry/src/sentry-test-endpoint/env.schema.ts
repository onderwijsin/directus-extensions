import { z } from 'zod'

/**
 * Validates the environment variables for the Sentry integration.
 *
 * @returns A Zod schema accepting valid environment variables.
 */
export const envSchema = z.object({
	SENTRY_ENABLED: z.stringbool().default(false),
	SENTRY_TEST_SUITE_ENABLED: z.stringbool().default(false),
})
