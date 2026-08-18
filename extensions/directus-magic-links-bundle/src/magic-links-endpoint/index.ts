import { InvalidCredentialsError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
	getSchemaChangeStatus,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_NAME, EXTENSION_ID } from '../magic-links-hook'
import { envSchema } from './env.schema'
import {
	parseRedeemPayload,
	parseRequestPayload,
	redeemMagicLink,
	requestMagicLink,
	SchemaLockedError,
} from './handlers'
import { sendAuthenticationResponse } from './session'

/**
 * Registers the magic-link API endpoint bundle entry.
 *
 * @param router - Directus's endpoint router.
 * @param context - Directus endpoint context.
 * @returns void
 */
export default defineEndpoint({
	id: 'auth/magic-links',
	/**
	 * Endpoint handler
	 * @param router - The ExpressJS routes
	 * @param context - Directus API Context
	 * @returns void
	 */
	handler: (router, context) => {
		const { database, env, getSchema, logger, services } = context
		const setup = extensionSetup(EXTENSION_NAME, env, logger)
		setup.start()

		if (!setup.isEnabled()) return

		const options = validateExtensionOptions(env, envSchema, logger)
		const secret = options.MAGIC_LINKS_TOKEN_SECRET ?? options.SECRET

		router.post('/request', (request, response, next) => {
			void attempt(async () => {
				const { isLocked } = await getSchemaChangeStatus({
					extensionId: EXTENSION_ID,
					options: {
						lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
					},
				})
				if (isLocked) {
					next(new SchemaLockedError())
					return
				}
				const payload = parseRequestPayload(
					request.body,
					options.MAGIC_LINKS_REDIRECT_URL_ALLOWLIST,
				)
				const result = await requestMagicLink({
					database,
					getSchema,
					services,
					options,
					secret,
					payload,
					ip: request.ip ?? null,
					userAgent: request.get('user-agent') ?? null,
				})
				response.status(202).json(result)
			}).then(({ error }) => {
				if (error) next(error)
			})
		})

		router.post('/redeem', (request, response, next) => {
			void attempt(async () => {
				const { isLocked } = await getSchemaChangeStatus({
					extensionId: EXTENSION_ID,
					options: {
						lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
					},
				})
				if (isLocked) {
					next(new SchemaLockedError())
					return
				}

				const payload = parseRedeemPayload(request.body)
				const result = await redeemMagicLink({
					database,
					getSchema,
					services,
					options,
					secret,
					payload,
					ip: request.ip ?? null,
					userAgent: request.get('user-agent') ?? null,
					origin: request.get('origin') ?? null,
				})
				if (!result) throw new InvalidCredentialsError()
				sendAuthenticationResponse(response, env, payload, result)
			}).then(({ error }) => {
				if (error) next(error)
			})
		})

		setup.end()
	},
})

export { parseRedeemPayload, parseRequestPayload, redeemMagicLink, requestMagicLink }
