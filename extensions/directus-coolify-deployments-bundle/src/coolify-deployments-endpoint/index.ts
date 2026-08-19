import type { NextFunction, Request } from 'express'

import { ForbiddenError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	extensionSetup,
	hasKey,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_ID, EXTENSION_NAME } from '../shared/constants'
import { requirePolicies } from './auth'
import { envSchema } from './env.schema'
import { NotImplemented, rejectWhileSchemaLocked } from './errors'
import { hasAuthenticatedUser } from './helpers'
import { isSameOriginRequest } from './same-origin'

export default defineEndpoint({
	id: 'coolify-deployments',
	/**
	 * Register authenticated routes for the configured Coolify projects.
	 * @param router - Directus's endpoint router.
	 * @param context - Directus endpoint context.
	 * @param context.env - Directus environment values.
	 * @param context.logger - Directus extension logger.
	 * @param context.services - Directus API services.
	 * @param context.getSchema - Async Directus schema resolver.
	 * @returns Nothing.
	 */
	handler: (router, { env, logger, services, getSchema }) => {
		const setup = extensionSetup(EXTENSION_NAME, env, logger)
		setup.start()

		if (!setup.isEnabled()) return

		const options = validateExtensionOptions(env, envSchema, logger)
		const schemaLockOptions = {
			lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
		}
		/**
		 * Creates route middleware for one or more effective Directus policies.
		 * @param policies - Policy IDs required by the route.
		 * @returns Express middleware that forwards authorization failures.
		 */
		const authorizeRoute =
			(policies: string | string[]) =>
			(request: Request, _response: unknown, next: NextFunction) => {
				const accountability = hasKey(request, 'accountability')
					? request.accountability
					: null
				if (!hasAuthenticatedUser(accountability)) {
					next(new ForbiddenError())
					return
				}

				void getSchema()
					.then((schema) =>
						requirePolicies(accountability, policies, services, schema, next),
					)
					.catch((error: unknown) => next(error))
			}

		/**
		 * Apply authentication, origin, and schema readiness checks to every route.
		 * @param request - Directus request.
		 * @param _response - Directus response.
		 * @param next - Express middleware continuation.
		 * @returns Nothing.
		 */
		router.use((request, _response, next: NextFunction) => {
			const accountability = hasKey(request, 'accountability')
				? request.accountability
				: undefined
			if (accountability === null || !hasAuthenticatedUser(accountability)) {
				next(new ForbiddenError())
				return
			}
			if (!isSameOriginRequest(request)) {
				next(new ForbiddenError())
				return
			}

			void rejectWhileSchemaLocked(schemaLockOptions, next)
				.then((locked) => {
					if (!locked) next()
				})
				.catch((error: unknown) => next(error))
		})

		router.get(
			'/projects',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID),
			(_request, _response, next: NextFunction) => {
				next(new NotImplemented())
			},
		)

		router.get(
			'/projects/:id/deployments',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID),
			(_request, _response, next: NextFunction) => {
				next(new NotImplemented())
			},
		)

		router.get(
			'/projects/:id/deployments/:deploymentId',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID),
			(_request, _response, next: NextFunction) => {
				next(new NotImplemented())
			},
		)

		router.post(
			'/projects/:id/deploy',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID),
			(_request, _response, next: NextFunction) => {
				next(new NotImplemented())
			},
		)

		setup.end()
	},
})
