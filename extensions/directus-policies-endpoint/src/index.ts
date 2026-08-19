import { ForbiddenError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	extensionSetup,
	asyncHandler,
	getAccountabilityFromRequest,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { initializePolicyCache } from './cache'
import { envSchema } from './env.schema'
import { fetchPolicies } from './fetch-policies'

const EXTENSION_NAME = 'policies_endpoint'

export default defineEndpoint({
	id: 'users/me',
	/**
	 * Endpoint handler
	 * @param router - The ExpressJS routes
	 * @param context - Directus API Context
	 * @param context.services - Directus Services
	 * @param context.getSchema - Async database schema resolver
	 * @param context.env - Directus Environment
	 * @param context.logger - Pino Logger
	 * @returns void
	 */
	handler: (router, { services, getSchema, env, logger }) => {
		const setup = extensionSetup(EXTENSION_NAME, env, logger)
		setup.start()

		if (!setup.isEnabled()) return
		const options = validateExtensionOptions(env, envSchema, logger)
		const cache = initializePolicyCache(options)

		router.get(
			'/policies',
			asyncHandler(async (request, response) => {
				const accountability = getAccountabilityFromRequest(request)
				if (!accountability?.user) throw new ForbiddenError()
				const serviceAccountability = { ...accountability, admin: true }

				const schema = await getSchema()

				response.json(await fetchPolicies(serviceAccountability, services, schema, cache))
			}),
		)

		setup.end()
	},
})
