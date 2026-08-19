import { InvalidCredentialsError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
	getSchemaChangeStatus,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_ID, EXTENSION_NAME } from '../magic-links-hook/constants'
import { envSchema } from './env.schema'
import {
	parseRedeemPayload,
	parseRequestPayload,
	redeemMagicLink,
	requestMagicLink,
	SchemaLockedError,
} from './handlers'
import { createMagicLinkLimiter } from './rate-limiter'
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
		const schemaLockOptions = {
			lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
		}

		/**
		 * Forward a schema-lock error when this endpoint's schema is being changed.
		 * @param next - Express next callback.
		 * @returns Whether the request was rejected.
		 */
		const rejectWhileSchemaLocked = async (
			next: (error?: unknown) => void,
		): Promise<boolean> => {
			const { isLocked } = await getSchemaChangeStatus({
				extensionId: EXTENSION_ID,
				options: schemaLockOptions,
			})
			if (!isLocked) return false

			next(new SchemaLockedError())
			return true
		}

		let limiter: ReturnType<typeof createMagicLinkLimiter> | undefined
		/**
		 * Lazily creates the limiter so runtime settings changes are observed before the first redemption.
		 *
		 * @returns The magic-link redemption limiter.
		 */
		const getLimiter = () =>
			(limiter ??= createMagicLinkLimiter({ database, getSchema, options, services }))

		router.post('/request', (request, response, next) => {
			void attempt(async () => {
				if (await rejectWhileSchemaLocked(next)) return
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
				if (await rejectWhileSchemaLocked(next)) return

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
					limiter: await getLimiter(),
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
