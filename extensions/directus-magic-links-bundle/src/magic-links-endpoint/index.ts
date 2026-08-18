import { InvalidCredentialsError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { envSchema } from './env.schema'
import {
	parseRedeemPayload,
	parseRequestPayload,
	redeemMagicLink,
	requestMagicLink,
} from './handlers'
import { sendAuthenticationResponse } from './session'

const EXTENSION_NAME = 'magic_links'

/**
 * Registers the magic-link API endpoint bundle entry.
 *
 * @param router - Directus's endpoint router.
 * @param context - Directus endpoint context.
 * @returns void
 */
export default defineEndpoint((router, context) => {
	const { database, env, getSchema, logger, services } = context
	const setup = extensionSetup(EXTENSION_NAME, env, logger)
	setup.start()

	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(env, envSchema, logger)
	const secret = options.MAGIC_LINKS_TOKEN_SECRET ?? String(env.SECRET ?? '')
	router.post('/request', (request, response, next) => {
		void attempt(async () => {
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
			const payload = parseRedeemPayload(request.body)
			const result = await redeemMagicLink({
				database,
				getSchema,
				services,
				options,
				secret,
				payload,
			})
			if (!result) throw new InvalidCredentialsError()
			sendAuthenticationResponse(response, env, payload, result)
		}).then(({ error }) => {
			if (error) next(error)
		})
	})

	setup.end()
})

export { parseRedeemPayload, parseRequestPayload, redeemMagicLink, requestMagicLink }
