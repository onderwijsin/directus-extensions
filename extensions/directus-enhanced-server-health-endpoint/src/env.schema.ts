import { z } from 'zod'

import { components } from './constants'

/**
 * Validates the environment variables used by the enhanced server health endpoint.
 *
 * @returns The enhanced server health endpoint environment schema.
 */
export const envSchema = z.object({
	ENHANCED_SERVER_HEALTH_ENDPOINT_ENABLED: z.boolean().default(true),

	HEALTHCHECK_INCLUDE_CHECKS: z.array(z.union([z.literal('*'), z.string()])).default(['*']),
	// Takes precendence over includes. E.g. an excluded check is ALWAYS excluded, reagrdless of whether it's component type is included
	HEALTHCHECK_EXCLUDE_CHECKS: z.array(z.union([z.literal('*'), z.string()])).default([]),

	HEALTHCHECK_INCLUDE_COMPONENTS: z.array(z.enum(components)).default([...components]),
	// Takes precendence over includes. E.g. an excluded component is ALWAYS excluded, regardless of whether its checks are included
	HEALTHCHECK_EXCLUDE_COMPONENTS: z.array(z.enum(components)).default([]),

	// Whether enhanced server health can also return status === 'warning'. If not, 'warning' is returned as 'ok'
	HEALTHCHECK_EXPOSE_WARNING_STATUS: z.boolean().default(false),
})
