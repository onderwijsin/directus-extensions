import type { Request, Response } from 'express'
import type { CoolifyDeployment } from '../shared/coolify-client/schemas'

import { ForbiddenError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	asyncHandler,
	extensionSetup,
	hasKey,
	validateExtensionOptions,
	hasAuthenticatedUser,
	assertRequestWithAccountability,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_ID, EXTENSION_NAME } from '../shared/constants'
import { createCoolifyDeploymentClient } from '../shared/coolify-client'
import { requirePolicies } from './auth'
import { envSchema } from './env.schema'
import { CoolifyUpstreamError, rejectWhileSchemaLocked } from './errors'
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
		const client = createCoolifyDeploymentClient(options, { ...options, services, getSchema })
		const schemaLockOptions = {
			lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
		}

		/**
		 * Creates route middleware for one or more effective Directus policies.
		 * @param policies - Policy IDs required by the route.
		 * @returns Express middleware that forwards authorization failures.
		 */
		const authorizeRoute = (policies: string | string[]) =>
			asyncHandler(async (request, _response, next) => {
				const hasAccountability = assertRequestWithAccountability(request)

				if (!hasAccountability) {
					next(new ForbiddenError())
					return
				}

				const schema = await getSchema()
				await requirePolicies(request.accountability, policies, services, schema, next)
			})

		/**
		 * Apply authentication, origin, and schema readiness checks to every route.
		 * @param request - Directus request.
		 * @param _response - Directus response.
		 * @param next - Express middleware continuation.
		 * @returns Nothing.
		 */
		router.use(
			asyncHandler(async (request, _response, next) => {
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

				const locked = await rejectWhileSchemaLocked(schemaLockOptions, next)
				if (!locked) next()
			}),
		)

		/**
		 * Normalize provider deployment data for Studio consumers.
		 * @param deployment - Provider deployment.
		 * @returns Normalized deployment data.
		 */
		const normalizeDeployment = (deployment: CoolifyDeployment) => ({
			id: deployment.deploymentUuid,
			applicationId: deployment.applicationId,
			status: /queued|pending/iu.test(deployment.status)
				? 'queued'
				: /running|building|in_progress/iu.test(deployment.status)
					? 'building'
					: /success|finished|ready/iu.test(deployment.status)
						? 'ready'
						: /cancel/iu.test(deployment.status)
							? 'canceled'
							: /fail|error/iu.test(deployment.status)
								? 'error'
								: 'queued',
			rawStatus: deployment.status,
			commitSha: deployment.commit,
			commitMessage: deployment.commitMessage,
			createdAt: deployment.createdAt,
			startedAt: deployment.createdAt,
			finishedAt: null,
			duration: null,
			branch: null,
			url: deployment.deploymentUrl,
			coolifyUrl: deployment.deploymentUrl,
			triggeredBy: null,
		})

		/**
		 * Resolve a configured application by its stable Directus identifier.
		 * @param id - Stable Directus application identifier.
		 * @returns Configured application.
		 */
		const getConfiguredApplication = async (id: string) => {
			const application = (await client.listConfiguredApplication()).find(
				(item) => item.id === id,
			)
			if (!application) throw new CoolifyUpstreamError()
			return application
		}

		/**
		 * Wrap provider operations and expose only safe upstream errors.
		 * @param operation - Provider operation.
		 * @returns Express middleware.
		 */
		const handle = (operation: (request: Request, response: Response) => Promise<void>) =>
			asyncHandler(async (request, response, next) => {
				try {
					await operation(request, response)
				} catch (error: unknown) {
					logger.error(error)
					next(error instanceof CoolifyUpstreamError ? error : new CoolifyUpstreamError())
				}
			})

		router.get(
			'/applications',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID),
			handle(async (_request, response) => {
				const configured = await client.listConfiguredApplication()
				const applications = await Promise.all(
					configured.map(async (item) => {
						const provider = await client.getApplication(item.application_uuid)
						const latest = (
							await client.listApplicationDeployments(item.application_uuid)
						)[0]
						return {
							id: item.id,
							name: item.name || provider.name,
							url: item.production_url ?? provider.fqdn,
							projectName: item.project_name,
							latestDeployment: latest ? normalizeDeployment(latest) : null,
						}
					}),
				)
				response.json(applications)
			}),
		)

		router.get(
			'/applications/:id/deployments',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID),
			handle(async (request, response) => {
				const application = await getConfiguredApplication(request.params.id ?? '')
				const deployments = await client.listApplicationDeployments(
					application.application_uuid,
				)
				response.json(
					deployments.map((deployment) => ({
						...normalizeDeployment(deployment),
						applicationId: application.id,
					})),
				)
			}),
		)

		router.get(
			'/applications/:id/deployments/:deploymentId',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID),
			handle(async (request, response) => {
				await getConfiguredApplication(request.params.id ?? '')
				response.json(
					normalizeDeployment(
						await client.getDeployment(request.params.deploymentId ?? ''),
					),
				)
			}),
		)

		router.post(
			'/applications/:id/deployments',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID),
			handle(async (request, response) => {
				const application = await getConfiguredApplication(request.params.id ?? '')
				const result = await client.deploy({
					uuid: application.application_uuid,
					force: true,
				})
				const deployment = result[0]
				if (!deployment) throw new CoolifyUpstreamError()
				response.status(201).json({ id: deployment.deploymentUuid })
			}),
		)

		router.post(
			'/applications/:id/deployments/:deploymentId/cancel',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID),
			handle(async (request, response) => {
				await getConfiguredApplication(request.params.id ?? '')
				response.json(await client.cancelDeployment(request.params.deploymentId ?? ''))
			}),
		)

		setup.end()
	},
})
