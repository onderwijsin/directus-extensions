import { ForbiddenError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	extensionSetup,
	asyncHandler,
	getAccountabilityFromRequest,
	initializeCache,
	fetchPolicies,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { envSchema } from './env.schema'

const EXTENSION_NAME = 'policies_endpoint'
const POLICY_CACHE_TTL_MS = 5_000

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
		const cache = initializeCache(options, { ttl: POLICY_CACHE_TTL_MS })

		router.get(
			'/policies',
			asyncHandler(async (request, response) => {
				const accountability = getAccountabilityFromRequest(request)
				if (!accountability?.user) throw new ForbiddenError()

				const schema = await getSchema()

				response.json(
					await fetchPolicies(
						accountability,
						services,
						schema,
						cache,
						options.DIRECTUS_POLICIES_ENDPOINT_BYPASS_ACCOUNTABILITY
							? null
							: accountability,
					),
				)
			}),
		)

		setup.end()
	},
})
