import type { Request, Response } from 'express'

import { ForbiddenError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	asyncHandler,
	extensionSetup,
	hasKey,
	validateExtensionOptions,
	hasAuthenticatedUser,
	assertRequestWithAccountability,
	attempt,
	initializePolicyCache,
	getAccountabilityFromRequest,
} from '@onderwijsin/directus-extension-utils/server'

import {
	COOLIFY_DASHBOARD_CONCURRENCY,
	DEPLOYMENT_POLL_INTERVAL_HEADER,
	EXTENSION_ID,
	EXTENSION_NAME,
} from '../shared/constants'
import { createCoolifyDeploymentClient } from '../shared/coolify-client'
import { isAssignedPolicy, requirePolicies } from './auth'
import { envSchema } from './env.schema'
import {
	CoolifyDeploymentApplicationMismatchError,
	CoolifyUpstreamError,
	rejectWhileSchemaLocked,
} from './errors'
import { assertDeploymentBelongsToApplication, normalizeDeployment, safeHttpUrl } from './helpers'
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
		const policyCache = initializePolicyCache(options)
		const client = createCoolifyDeploymentClient(options, {
			...options,
			services,
			getSchema,
			logger,
		})
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
				await requirePolicies(
					request.accountability,
					policies,
					services,
					schema,
					policyCache,
					next,
				)
			})

		/**
		 * Apply authentication, origin, and schema readiness checks to every route.
		 * @param request - Directus request.
		 * @param _response - Directus response.
		 * @param next - Express middleware continuation.
		 * @returns Nothing.
		 */
		router.use(
			asyncHandler(async (request, response, next) => {
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

				response.setHeader(
					DEPLOYMENT_POLL_INTERVAL_HEADER,
					String(options.COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS),
				)
				response.setHeader(
					'X-Coolify-Deployments-Applications-Collection',
					options.COOLIFY_APPLICATIONS_COLLECTION,
				)
				const locked = await rejectWhileSchemaLocked(schemaLockOptions, next)
				if (!locked) next()
			}),
		)

		/**
		 * Wrap provider operations and expose only safe upstream errors.
		 * @param operation - Provider operation.
		 * @returns Express middleware.
		 */
		const handle = (operation: (request: Request, response: Response) => Promise<void>) =>
			asyncHandler(async (request, response, next) => {
				const { error } = await attempt(() => operation(request, response))
				if (error) {
					logger.error(error)
					next(
						error instanceof CoolifyUpstreamError ||
							error instanceof CoolifyDeploymentApplicationMismatchError ||
							error instanceof ForbiddenError
							? error
							: new CoolifyUpstreamError(),
					)
				}
			})

		/**
		 * Load provider metadata and the latest deployment for one application.
		 * @param item - Configured application record.
		 * @returns Application summary.
		 */
		const loadApplicationSummary = async (
			item: Awaited<ReturnType<typeof client.listConfiguredApplication>>[number],
		) => {
			const provider = await client.getApplication(item.application_uuid)
			const latest = await client.getLatestApplicationDeployment(item.application_uuid)
			return {
				directusApplicationId: item.directusApplicationId,
				name: item.name || provider.name,
				url: safeHttpUrl(item.production_url ?? provider.fqdn),
				projectName: item.project_name,
				environmentName: item.environment_name,
				state: provider.status,
				gitBranch: provider.gitBranch,
				gitCommitSha: provider.gitCommitSha,
				gitRepository: provider.gitRepository,
				buildPack: provider.buildPack,
				serverName: provider.serverName,
				latestDeployment: latest
					? {
							...normalizeDeployment(latest, { COOLIFY_URL: options.COOLIFY_URL }),
							directusApplicationId: item.directusApplicationId,
						}
					: null,
			}
		}

		/**
		 * Resolve application summaries with bounded provider concurrency.
		 * @param configured - Configured application records.
		 * @returns Application summaries in configuration order.
		 */
		const loadApplicationSummaries = async (
			configured: Awaited<ReturnType<typeof client.listConfiguredApplication>>,
		) => {
			const results = new Array<Awaited<ReturnType<typeof loadApplicationSummary>>>(
				configured.length,
			)
			let nextIndex = 0
			/**
			 * Process assigned applications until the shared queue is empty.
			 * @returns Nothing.
			 */
			const worker = async () => {
				while (nextIndex < configured.length) {
					const index = nextIndex
					nextIndex += 1
					const item = configured[index]
					if (item) results[index] = await loadApplicationSummary(item)
				}
			}
			await Promise.all(
				Array.from(
					{ length: Math.min(COOLIFY_DASHBOARD_CONCURRENCY, configured.length) },
					() => worker(),
				),
			)
			return results.filter(
				(result): result is Awaited<ReturnType<typeof loadApplicationSummary>> =>
					result !== undefined,
			)
		}

		router.get(
			'/permissions',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID),
			(_request, response) => response.json({ canTrigger: true }),
		)

		router.get(
			'/operation/applications',
			handle(async (request, response) => {
				const accountability = getAccountabilityFromRequest(request)
				const applications = await new services.ItemsService<{
					id: string | number
					name: string
				}>(options.COOLIFY_APPLICATIONS_COLLECTION, {
					schema: await getSchema(),
					accountability,
				}).readByQuery({
					fields: ['id', 'name'],
					filter: {
						enabled: { _eq: true },
						deploy_enabled: { _eq: true },
					},
					limit: -1,
					sort: ['name', 'id'],
				})
				response.json(
					applications.map((application) => ({
						id: String(application.id),
						name: application.name,
					})),
				)
			}),
		)

		router.get(
			'/dashboard',
			authorizeRoute([
				options.COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID,
				options.COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID,
			]),
			handle(async (request, response) => {
				const configured = await client.listConfiguredApplication()
				const applications = await loadApplicationSummaries(configured)
				const applicationByUuid = new Map(
					configured.map((application) => [application.application_uuid, application]),
				)
				const deployments = (await client.listDashboardDeployments(configured))
					.map((deployment) => {
						const application = applicationByUuid.get(deployment.coolifyApplicationId)
						return {
							...normalizeDeployment(deployment, {
								COOLIFY_URL: options.COOLIFY_URL,
							}),
							directusApplicationId: application?.directusApplicationId ?? '',
							applicationName: application?.name ?? null,
							environmentName: application?.environment_name ?? null,
						}
					})
					.filter((deployment) => deployment.directusApplicationId !== '')
				const current = deployments.filter((deployment) =>
					['queued', 'building'].includes(deployment.status),
				)
				const accountability = getAccountabilityFromRequest(request)
				const canTriggerDeployments = accountability
					? accountability.admin ||
						(hasKey(accountability, 'admin_access') &&
							accountability.admin_access === true) ||
						(await isAssignedPolicy(
							accountability,
							options.COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID,
							services,
							await getSchema(),
							policyCache,
						))
					: false
				response.json({
					applications,
					current,
					recent: deployments.slice(0, 10),
					canTriggerDeployments,
				})
			}),
		)

		router.get(
			'/applications',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID),
			handle(async (_request, response) => {
				const configured = await client.listConfiguredApplication()
				response.json(await loadApplicationSummaries(configured))
			}),
		)

		router.get(
			'/applications/:id/deployments',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID),
			handle(async (request, response) => {
				const application = await client.getConfiguredApplication(request.params.id ?? '', {
					bypassCache: true,
				})
				const deployments = await client.listApplicationDeployments(
					application.application_uuid,
				)
				response.json(
					deployments.map((deployment) => ({
						...normalizeDeployment(deployment, { COOLIFY_URL: options.COOLIFY_URL }),
						directusApplicationId: application.directusApplicationId,
						applicationName: application.name,
						environmentName: application.environment_name,
					})),
				)
			}),
		)

		router.get(
			'/applications/:id/deployments/:deploymentId',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID),
			handle(async (request, response) => {
				const application = await client.getConfiguredApplication(request.params.id ?? '', {
					bypassCache: true,
				})
				const deployment = await client.getDeployment(request.params.deploymentId ?? '')
				assertDeploymentBelongsToApplication(deployment, application.application_uuid)
				response.json({
					...normalizeDeployment(deployment, { COOLIFY_URL: options.COOLIFY_URL }),
					directusApplicationId: application.directusApplicationId,
					applicationName: application.name,
					environmentName: application.environment_name,
				})
			}),
		)

		router.post(
			'/applications/:id/deployments',
			authorizeRoute(options.COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID),
			handle(async (request, response) => {
				const application = await client.getConfiguredApplication(request.params.id ?? '', {
					bypassCache: true,
				})
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
				const application = await client.getConfiguredApplication(request.params.id ?? '', {
					bypassCache: true,
				})
				const deployment = await client.getDeployment(request.params.deploymentId ?? '')
				assertDeploymentBelongsToApplication(deployment, application.application_uuid)
				response.json(await client.cancelDeployment(request.params.deploymentId ?? ''))
			}),
		)

		setup.end()
	},
})
