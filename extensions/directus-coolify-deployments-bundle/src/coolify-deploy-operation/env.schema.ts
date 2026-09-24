import {
	cacheConfig,
	defineExtensionOptionsSchema,
} from '@onderwijsin/directus-extension-utils/server'

import { DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID } from '../shared/constants'
import { defineCoolifyEnvironmentOptions } from '../shared/coolify-client/schemas'

/** Environment configuration used by the Coolify deployment operation. */
export const envSchema = defineExtensionOptionsSchema({
	include: [cacheConfig],
	/**
	 * Builds operation fields with the shared package's Zod runtime.
	 * @param z - The package-owned Zod runtime.
	 * @returns Operation environment fields.
	 */
	options: (z) => ({
		...defineCoolifyEnvironmentOptions(z),
		COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: z
			.uuid()
			.default(DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID),
	}),
})
