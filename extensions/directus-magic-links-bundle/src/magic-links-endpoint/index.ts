import { InvalidCredentialsError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	asyncHandler,
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_NAME } from '../magic-links-hook/constants'
import { envSchema } from './env.schema'
import {
	parseRedeemPayload,
	parseRequestPayload,
	redeemMagicLink,
	requestMagicLink,
} from './handlers'
import {
	createMagicLinksRedisClient,
	createRedeemLimiter,
	createRequestLimiter,
} from './rate-limiter'
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
		const { env, logger } = context
		const setup = extensionSetup(EXTENSION_NAME, env, logger)
		setup.start()

		if (!setup.isEnabled()) return

		const options = validateExtensionOptions(env, envSchema, logger)
		const secret = options.MAGIC_LINKS_TOKEN_SECRET ?? options.SECRET
		const redis = createMagicLinksRedisClient(options)
		const requestLimiter = createRequestLimiter({ options, redis })
		let redeemLimiter: ReturnType<typeof createRedeemLimiter> | undefined
		/**
		 * Lazily creates the limiter so runtime settings changes are observed before the first redemption.
		 * @returns The magic-link redemption limiter.
		 */
		const getRedeemLimiter = () =>
			(redeemLimiter ??= createRedeemLimiter({ context, options, redis }))

		router.post(
			'/request',
			asyncHandler(async (request, response) => {
				await requestLimiter.consume(request.ip ?? 'unknown')
				const payload = parseRequestPayload(
					request.body,
					options.MAGIC_LINKS_REDIRECT_URL_ALLOWLIST,
				)
				const result = await requestMagicLink({
					context,
					options,
					request: {
						secret,
						payload,
						ip: request.ip ?? null,
						userAgent: request.get('user-agent') ?? null,
					},
				})
				response.status(202).json(result)
			}),
		)

		router.post(
			'/redeem',
			asyncHandler(async (request, response) => {
				const payload = parseRedeemPayload(request.body)
				const result = await redeemMagicLink({
					context,
					options,
					request: {
						secret,
						payload,
						ip: request.ip ?? null,
						userAgent: request.get('user-agent') ?? null,
						origin: request.get('origin') ?? null,
						limiter: await getRedeemLimiter(),
					},
				})
				if (!result) throw new InvalidCredentialsError()
				sendAuthenticationResponse(response, env, payload, result)
			}),
		)

		setup.end()
	},
})

export { parseRedeemPayload, parseRequestPayload, redeemMagicLink, requestMagicLink }
