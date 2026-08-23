import { cacheConfigSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import { DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID } from '../shared/constants'
import { coolifyEnvironmentSchema } from '../shared/coolify-client/schemas'

const operationEnvSchema = coolifyEnvironmentSchema.extend({
	COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: z
		.uuid()
		.default(DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID),
})

export const envSchema = z.intersection(
	operationEnvSchema,
	cacheConfigSchema.safeExtend({ CACHE_ENABLED: z.boolean().default(true) }),
)
