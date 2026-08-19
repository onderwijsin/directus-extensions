import { z } from 'zod'

/**
 * Validates the environment variables used by the policies endpoint.
 *
 * @returns The policies endpoint environment schema.
 */
export const envSchema = z
	.object({
		POLICIES_ENDPOINT_ENABLED: z.boolean().default(true),
		CACHE_ENABLED: z.boolean().default(true),
		CACHE_STORE: z.enum(['redis', 'memory']).default('memory'),
		REDIS: z.string().trim().min(1).optional(),
	})
	.superRefine((options, context) => {
		if (options.CACHE_STORE === 'redis' && !options.REDIS) {
			context.addIssue({
				code: 'custom',
				path: ['REDIS'],
				message: 'REDIS is required when CACHE_STORE is redis',
			})
		}
	})
