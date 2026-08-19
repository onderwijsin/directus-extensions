import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import {
	DEFAULT_MANAGE_APPLICATIONS_POLICY_ID,
	DEFAULT_READ_DEPLOYMENTS_POLICY_ID,
	DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID,
} from '../shared/constants'
import { coolifyEnvironmentSchema } from '../shared/coolify-client/schemas'

/**
 * Validates environment values used by the Coolify deployments endpoint.
 * @returns The endpoint environment schema.
 */
export const envSchema = directusStartupSchema
	.extend(coolifyEnvironmentSchema.shape)
	.safeExtend({
		CACHE_ENABLED: z.boolean().default(true),
		CACHE_STORE: z.enum(['redis', 'memory']).default('memory'),
		REDIS: z.string().trim().min(1).optional(),
		COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID: z
			.string()
			.trim()
			.min(1)
			.default(DEFAULT_MANAGE_APPLICATIONS_POLICY_ID),
		COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID: z
			.string()
			.trim()
			.min(1)
			.default(DEFAULT_READ_DEPLOYMENTS_POLICY_ID),
		COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: z
			.string()
			.trim()
			.min(1)
			.default(DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID),
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
