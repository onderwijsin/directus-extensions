import type { NextFunction, Response } from 'express'
import type { CoolifyDeployment } from '../shared/coolify-client/schemas'

import { ForbiddenError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	extensionSetup,
	hasKey,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_ID, EXTENSION_NAME } from '../shared/constants'
import { createCoolifyDeploymentClient } from '../shared/coolify-client'
import { deployRequestSchema, deploymentPaginationSchema } from '../shared/coolify-client/schemas'
import { envSchema } from './env.schema'
import {
	CoolifyUpstreamError,
	InvalidDeploymentRequestError,
	rejectWhileSchemaLocked,
	UnknownCoolifyProjectError,
} from './errors'
import { hasAuthenticatedUser } from './helpers'
import { isSameOriginRequest } from './same-origin'

export default defineEndpoint({
	id: 'coolify-deployments',
	/**
	 * Register authenticated routes for the configured Coolify projects.
	 * @param router - Directus's endpoint router.
	 * @param context - Directus endpoint context.
	 * @param context.env - Directus environment values.
	 * @param context.services - Directus service constructors.
	 * @param context.getSchema - Directus schema resolver.
	 * @param context.logger - Directus extension logger.
	 * @returns Nothing.
	 */
	handler: (router, { env, logger, services, getSchema }) => {
		const setup = extensionSetup(EXTENSION_NAME, env, logger)
		setup.start()

		if (!setup.isEnabled()) return

		const options = validateExtensionOptions(env, envSchema, logger)
		const client = createCoolifyDeploymentClient(options, {
			services,
			getSchema,
			cacheEnabled: options.CACHE_ENABLED,
			cacheStore: options.CACHE_STORE,
			redis: options.REDIS,
		})
		const configuredApplications = options.COOLIFY_PROJECTS
		const schemaLockOptions = {
			lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
		}

		/**
		 * Apply authentication and schema readiness checks to every route.
		 * @param request - Directus request.
		 * @param response - Directus response.
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

			void rejectWhileSchemaLocked(schemaLockOptions, next)
				.then((locked) => {
					if (!locked) next()
				})
				.catch((error: unknown) => next(error))
		})

		/**
		 * Resolve a provider operation and serialize its result or safe error.
		 * @param response - Directus response.
		 * @param next - Express error handler continuation.
		 * @param operation - Provider operation to execute.
		 * @returns Nothing.
		 */
		const handleProviderRequest = (
			response: Response,
			next: NextFunction,
			operation: () => Promise<unknown>,
		) => {
			void operation()
				.then((result) => response.json(result))
				.catch((error: unknown) => {
					logger.error(error)
					next(new CoolifyUpstreamError())
				})
		}

		/**
		 * Adapt a provider deployment for the current endpoint response contract.
		 * @param applicationId - Stable configured application ID.
		 * @param deployment - Parsed Coolify deployment.
		 * @returns Normalized deployment response.
		 */
		const toNormalizedDeployment = (applicationId: string, deployment: CoolifyDeployment) => {
			const status = deployment.status.toLowerCase()
			const normalizedStatus = status.includes('queue')
				? 'queued'
				: status.includes('run') ||
					  status.includes('progress') ||
					  status.includes('in_progress')
					? 'running'
					: status.includes('success') ||
						  status.includes('finish') ||
						  status.includes('completed')
						? 'success'
						: status.includes('cancel')
							? 'cancelled'
							: status.includes('fail') || status.includes('error')
								? 'failed'
								: 'unknown'
			const startedAt = deployment.createdAt
			const finishedAt = ['queued', 'running'].includes(normalizedStatus)
				? null
				: deployment.updatedAt
			const duration =
				startedAt !== null && finishedAt !== null
					? Date.parse(finishedAt) - Date.parse(startedAt)
					: null

			return {
				id: deployment.deploymentUuid,
				applicationId,
				status: normalizedStatus,
				rawStatus: deployment.status,
				commitSha: deployment.commit,
				commitMessage: deployment.commitMessage,
				deploymentUrl: deployment.deploymentUrl,
				startedAt,
				finishedAt,
				duration:
					duration !== null && Number.isFinite(duration) && duration >= 0
						? duration
						: null,
			}
		}

		router.get('/projects', (_request, response) => {
			response.json(
				configuredApplications.map(({ id, name, productionUrl }) => ({
					id,
					name,
					productionUrl,
				})),
			)
		})

		router.get('/projects/:id/deployments', (request, response, next) => {
			const project = configuredApplications.find(({ id }) => id === request.params.id)
			if (!project) {
				next(new UnknownCoolifyProjectError())
				return
			}

			const pagination = deploymentPaginationSchema.safeParse(request.query)
			if (!pagination.success) {
				next(new InvalidDeploymentRequestError())
				return
			}

			handleProviderRequest(response, next, () =>
				client
					.listApplicationDeployments(project.applicationUuid)
					.then((deployments) =>
						deployments
							.slice(
								pagination.data.skip,
								pagination.data.skip + pagination.data.take,
							)
							.map((deployment) => toNormalizedDeployment(project.id, deployment)),
					),
			)
		})

		router.get('/projects/:id/deployments/:deploymentId', (request, response, next) => {
			const project = configuredApplications.find(({ id }) => id === request.params.id)
			if (!project) {
				next(new UnknownCoolifyProjectError())
				return
			}

			handleProviderRequest(response, next, () =>
				client.getDeployment(request.params.deploymentId).then((deployment) => {
					if (deployment.applicationId !== project.applicationUuid) {
						throw new UnknownCoolifyProjectError()
					}
					return toNormalizedDeployment(project.id, deployment)
				}),
			)
		})

		router.post('/projects/:id/deploy', (request, response, next) => {
			if (!isSameOriginRequest(request)) {
				next(new ForbiddenError())
				return
			}

			const project = configuredApplications.find(({ id }) => id === request.params.id)
			if (!project) {
				next(new UnknownCoolifyProjectError())
				return
			}

			const payload = deployRequestSchema.safeParse(request.body ?? {})
			if (!payload.success) {
				next(new InvalidDeploymentRequestError())
				return
			}

			handleProviderRequest(response, next, () =>
				client
					.deploy({ uuid: project.applicationUuid, force: payload.data.force })
					.then(([result]) => {
						if (!result) throw new CoolifyUpstreamError()
						return {
							id: result.deploymentUuid,
							applicationId: project.id,
							status: 'unknown',
							rawStatus: result.message,
							commitSha: null,
							commitMessage: null,
							deploymentUrl: null,
							startedAt: null,
							finishedAt: null,
							duration: null,
						}
					}),
			)
		})

		setup.end()
	},
})
