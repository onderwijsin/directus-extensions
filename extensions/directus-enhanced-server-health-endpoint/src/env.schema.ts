import { z } from 'zod'

import { components } from './constants'

/**
 * Accepts either one value or an array and normalizes the result to an array.
 *
 * @param schema - Schema for each accepted value.
 * @param defaultValue - Default array when the value is not configured.
 * @returns A schema that parses single values and arrays uniformly.
 */
const arrayOrSingle = <T extends z.ZodType>(schema: T, defaultValue: z.output<T>[]) =>
	z.preprocess(
		(value) => (value === undefined || Array.isArray(value) ? value : [value]),
		z.array(schema).default(defaultValue),
	)

/**
 * Validates the environment variables used by the enhanced server health endpoint.
 *
 * @returns The enhanced server health endpoint environment schema.
 */
export const envSchema = z.object({
	ENHANCED_SERVER_HEALTH_ENDPOINT_ENABLED: z.boolean().default(true),

	HEALTHCHECK_INCLUDE_CHECKS: arrayOrSingle(z.union([z.literal('*'), z.string()]), ['*']),
	// Takes precendence over includes. E.g. an excluded check is ALWAYS excluded, reagrdless of whether it's component type is included
	HEALTHCHECK_EXCLUDE_CHECKS: arrayOrSingle(z.union([z.literal('*'), z.string()]), []),

	HEALTHCHECK_INCLUDE_COMPONENTS: arrayOrSingle(z.enum(components), [...components]),
	// Takes precendence over includes. E.g. an excluded component is ALWAYS excluded, regardless of whether its checks are included
	HEALTHCHECK_EXCLUDE_COMPONENTS: arrayOrSingle(z.enum(components), []),

	// Whether enhanced server health can also return status === 'warning'. If not, 'warning' is returned as 'ok'
	HEALTHCHECK_EXPOSE_WARNING_STATUS: z.boolean().default(false),
})
