import { InternalServerError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	attempt,
	createSystemAdminAccountability,
	isDefined,
} from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import { envSchema } from './env.schema'
import { getHealthStatus } from './health'
import { serverHealthSchema } from './healthcheck.schema'

const EXTENSION_NAME = 'enhanced_server_health_endpoint'

export default defineEndpoint({
	id: 'server/health',
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

		router.get('/enhanced', (_, response, next) => {
			void attempt(async () => {
				response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
				response.setHeader('Pragma', 'no-cache')
				response.setHeader('Expires', '0')

				const { data, error } = await attempt(async () => {
					const schema = await getSchema()
					const serverService = new services.ServerService({
						schema,
						accountability: createSystemAdminAccountability(),
					})

					const raw = await serverService.health()
					const serverHealth = serverHealthSchema.safeParse(raw)

					if (!serverHealth.success) {
						logger.error('Enhanced Server Health Check validation failed')
						logger.info(z.prettifyError(serverHealth.error))
						throw new InternalServerError()
					}

					return serverHealth.data
				})

				if (error || !data) {
					next(new InternalServerError())
					return
				}

				const status = getHealthStatus(data.checks, options)

				response.setHeader('Content-Type', 'application/json')
				if (status === 'error') response.status(503)
				response.json({ status })
			}).then((result) => {
				if (isDefined(result.error) && result.error !== null) next(result.error)
			})
		})

		setup.end()
	},
})
