import { z } from 'zod'

import { DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID } from '../shared/constants'
import { coolifyEnvironmentSchema } from '../shared/coolify-client/schemas'

export const envSchema = coolifyEnvironmentSchema.extend({
	COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: z
		.string()
		.uuid()
		.default(DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID),
})
