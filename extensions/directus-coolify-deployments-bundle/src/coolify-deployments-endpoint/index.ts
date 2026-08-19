import { defineEndpoint } from '@directus/extensions-sdk'
import {
	getDirectusStartupStatus,
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_ID, EXTENSION_NAME } from '../shared/constants'
import { createCoolifyDeploymentClient } from '../shared/coolify-client'
import { deployRequestSchema, deploymentPaginationSchema } from '../shared/schemas'
import { envSchema } from './env.schema'
import { isSameOriginRequest } from './same-origin'

export default defineEndpoint({
	id: 'coolify-deployments',
	/**
	 * Register authenticated routes for the configured Coolify projects.
	 * @param router - Directus's endpoint router.
	 * @param context - Directus endpoint context.
	 * @param context.env - Directus environment values.
	 * @param context.logger - Directus extension logger.
	 * @returns Nothing.
	 */
	handler: (router, { env, logger }) => {
		interface RequestWithAccountability {
			get: (header: string) => string | undefined
			protocol: string
			accountability?: { user?: string | null } | null
		}
		interface Response {
			json: (body: unknown) => void
			status: (code: number) => Response
		}

		const setup = extensionSetup(EXTENSION_NAME, env, logger)
		setup.start()

		if (!setup.isEnabled()) return

		const options = validateExtensionOptions(env, envSchema, logger)
		const client = createCoolifyDeploymentClient(options)
		const schemaLockOptions = {
			lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
		}

		/**
		 * Reject requests while this bundle's schema is being changed.
		 * @param response - Directus response.
		 * @returns Whether the request was rejected.
		 */
		const rejectWhileSchemaLocked = async (response: Response): Promise<boolean> => {
			const { isLocked } = await getDirectusStartupStatus({
				id: EXTENSION_ID,
				options: schemaLockOptions,
			})
			if (!isLocked) return false

			response.status(503).json({ error: 'Schema changes are in progress' })
			return true
		}

		/**
		 * Return whether the request belongs to an authenticated Directus user.
		 * @param request - Directus request.
		 * @returns Whether the request has a user accountability.
		 */
		const isAuthenticated = (request: RequestWithAccountability) =>
			request.accountability?.user != null

		/**
		 * Return a consistent authentication error response.
		 * @param response - Directus response.
		 * @returns Nothing.
		 */
		const respondUnauthenticated = (response: Response) => {
			response.status(403).json({ error: 'Authentication is required' })
		}

		/**
		 * Return a safe provider error response and log diagnostic details server-side.
		 * @param response - Directus response.
		 * @param error - Provider or validation error.
		 * @returns Nothing.
		 */
		const respondProviderError = (response: Response, error: unknown) => {
			logger.error(error)
			response.status(502).json({ error: 'Coolify request failed' })
		}

		/**
		 * Run a route handler after checking the schema lock without returning a promise to Express.
		 * @param response - Directus response.
		 * @param handler - Route logic to run when the schema is available.
		 * @returns Nothing.
		 */
		const runAfterSchemaCheck = (response: Response, handler: () => void): void => {
			void rejectWhileSchemaLocked(response)
				.then((locked) => {
					if (!locked) handler()
				})
				.catch((error: unknown) => respondProviderError(response, error))
		}

		router.get('/projects', (request, response) => {
			runAfterSchemaCheck(response, () => {
				if (!isAuthenticated(request)) {
					respondUnauthenticated(response)
					return
				}

				response.json(client.listProjects())
			})
		})

		router.get('/projects/:id/deployments', (request, response) => {
			runAfterSchemaCheck(response, () => {
				if (!isAuthenticated(request)) {
					respondUnauthenticated(response)
					return
				}

				const project = client.resolveProject(request.params.id)
				if (!project) {
					response.status(404).json({ error: 'Unknown Coolify project' })
					return
				}

				const pagination = deploymentPaginationSchema.safeParse(request.query)
				if (!pagination.success) {
					response.status(400).json({ error: 'Invalid deployment pagination' })
					return
				}

				void client
					.listDeployments(project, pagination.data)
					.then((deployments) => response.json(deployments))
					.catch((error: unknown) => respondProviderError(response, error))
			})
		})

		router.get('/projects/:id/deployments/:deploymentId', (request, response) => {
			runAfterSchemaCheck(response, () => {
				if (!isAuthenticated(request)) {
					respondUnauthenticated(response)
					return
				}

				const project = client.resolveProject(request.params.id)
				if (!project) {
					response.status(404).json({ error: 'Unknown Coolify project' })
					return
				}

				void client
					.getDeployment(project, request.params.deploymentId)
					.then((deployment) => response.json(deployment))
					.catch((error: unknown) => respondProviderError(response, error))
			})
		})

		router.post('/projects/:id/deploy', (request, response) => {
			runAfterSchemaCheck(response, () => {
				if (!isSameOriginRequest(request)) {
					response.status(403).json({ error: 'Same-origin request required' })
					return
				}

				if (!isAuthenticated(request)) {
					respondUnauthenticated(response)
					return
				}

				const project = client.resolveProject(request.params.id)
				if (!project) {
					response.status(404).json({ error: 'Unknown Coolify project' })
					return
				}

				const payload = deployRequestSchema.safeParse(request.body ?? {})
				if (!payload.success) {
					response.status(400).json({ error: 'Invalid deployment payload' })
					return
				}

				void client
					.deploy(project, payload.data.force)
					.then((deployment) => response.json(deployment))
					.catch((error: unknown) => respondProviderError(response, error))
			})
		})

		setup.end()
	},
})
