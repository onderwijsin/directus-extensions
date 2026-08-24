import type {
	CoolifyApplication,
	CoolifyApplicationFilter,
	CoolifyDeployment,
	CoolifyDeploymentCancellationResult,
	CoolifyDeploymentRequest,
	CoolifyDeploymentTriggerResult,
	CoolifyDeploymentsOptions,
	CoolifyEnvironment,
	CoolifyProject,
} from './schemas'
import type { CoolifyDeploymentClient } from './types'
import type { DirectusCoolifyApplication } from './types'

import { ForbiddenError } from '@directus/errors'
import { initializeCache, withCache } from '@onderwijsin/directus-extension-utils/server'
import { ofetch } from 'ofetch'

import { COOLIFY_REQUEST_TIMEOUT_MS, LIST_APPLICATION_CACHE_DURATION_MS } from '../constants'

export type {
	CoolifyDeploymentClient,
	DirectusCoolifyApplication,
	CoolifyClientContext,
	GetApplicationOptions,
} from './types'

import type { CoolifyClientContext, GetApplicationOptions } from './types'

import {
	getAllowedApplications as resolveAllowedApplications,
	getAllowedEnvironments as resolveAllowedEnvironments,
	getAllowedProjects as resolveAllowedProjects,
} from './resolvers'
import {
	coolifyApplicationSchema,
	coolifyApplicationsResponseSchema,
	coolifyDeploymentCancellationSchema,
	coolifyDeploymentsResponseSchema,
	coolifyDeploymentSchema,
	coolifyDeploymentTriggerResponseSchema,
	coolifyDeploymentRequestSchema,
	coolifyDeploymentsListSchema,
	coolifyEnvironmentResponseSchema,
	coolifyEnvironmentsResponseSchema,
	coolifyProjectSchema,
	coolifyProjectsResponseSchema,
	coolifyApplicationFilterSchema,
} from './schemas'

const API_PREFIX = '/api/v1'
const CONFIGURED_APPLICATIONS_CACHE_KEY = 'coolify-deployments:configured-applications'
const APPLICATIONS_CACHE_NAMESPACE = 'directus:extensions:coolify-deployments:applications'
const DEPLOYMENT_PAGE_SIZE = 100

/**
 * Create a typed client for Coolify's documented project, environment, application, and deployment API.
 * @param options - Validated Coolify configuration.
 * @param context - Directus services and configured application cache settings.
 * @returns The Coolify client.
 */
export function createCoolifyDeploymentClient(
	options: CoolifyDeploymentsOptions,
	context?: CoolifyClientContext,
): CoolifyDeploymentClient {
	const baseUrl = options.COOLIFY_URL.replace(/\/$/u, '')
	const cache = context
		? initializeCache(context, {
				ttl: LIST_APPLICATION_CACHE_DURATION_MS,
				namespace: APPLICATIONS_CACHE_NAMESPACE,
			})
		: null

	/**
	 *
	 */
	/** @returns Cached enabled Coolify application records. */
	const readConfiguredApplications = () =>
		withCache(
			{
				cache,
				key: CONFIGURED_APPLICATIONS_CACHE_KEY,
			},
			async () => {
				if (!context)
					throw new Error('Directus context is required to list configured applications')

				const applications = await new context.services.ItemsService<
					DirectusCoolifyApplication & { id: string }
				>(options.COOLIFY_APPLICATIONS_COLLECTION, {
					schema: await context.getSchema(),
					accountability: null,
				}).readByQuery({ limit: -1, filter: { enabled: { _eq: true } } })

				return applications.map(({ id, ...application }) => ({
					...application,
					directusApplicationId: id,
				}))
			},
		)

	/**
	 * @param options - Cache behavior for this read.
	 * @param options.bypassCache - Whether to read the current allow-list.
	 * @returns Allow-listed applications from Directus.
	 */
	const listConfiguredApplication = async ({
		bypassCache = false,
	}: { bypassCache?: boolean } = {}): Promise<DirectusCoolifyApplication[]> => {
		if (!context)
			throw new Error('Directus context is required to list configured applications')

		if (bypassCache) {
			await cache?.delete(CONFIGURED_APPLICATIONS_CACHE_KEY)
		}

		return readConfiguredApplications()
	}

	/**
	 * Resolve a configured application by its stable Directus identifier.
	 * @param id - Stable Directus application identifier.
	 * @param options - Cache behavior for this read.
	 * @param options.bypassCache - Whether to read the current application.
	 * @returns Configured application.
	 */
	const getConfiguredApplication = async (
		id: string,
		{ bypassCache = false }: { bypassCache?: boolean } = {},
	) => {
		if (!context) throw new Error('Directus context is required to get configured application')

		const key = `${CONFIGURED_APPLICATIONS_CACHE_KEY}:${id}`
		if (bypassCache) {
			await cache?.delete(key)
		}

		return withCache({ cache, key }, async () => {
			const application = (await listConfiguredApplication({ bypassCache })).find(
				(candidate) => candidate.directusApplicationId === id,
			)
			if (!application) throw new ForbiddenError()

			return application
		})
	}

	/** @returns Unique allowed Coolify application UUIDs. */
	const getAllowedApplications = () => resolveAllowedApplications(listConfiguredApplication)
	/** @returns Unique allowed Coolify project UUIDs. */
	const getAllowedProjects = () => resolveAllowedProjects(listConfiguredApplication)
	/** @returns Unique allowed Coolify environment UUIDs. */
	const getAllowedEnvironments = () => resolveAllowedEnvironments(listConfiguredApplication)

	/**
	 * Create an ofetch client with a bearer header.
	 */
	const providerRequest = ofetch.create({
		baseURL: `${baseUrl}${API_PREFIX}`,
		timeout: COOLIFY_REQUEST_TIMEOUT_MS,
		headers: {
			Authorization: `Bearer ${options.COOLIFY_TOKEN}`,
		},
	})
	/**
	 * Request Coolify without logging successful provider response bodies.
	 * @param path - Coolify API path.
	 * @param requestOptions - Optional request options.
	 * @returns The unparsed provider response.
	 */
	const request = async (
		path: string,
		requestOptions?: Parameters<typeof providerRequest>[1],
	): Promise<unknown> => {
		return providerRequest(path, requestOptions)
	}

	/**
	 * @param value - UUID to authorize.
	 * @param allowedValues - Resolver for the corresponding allow-list.
	 * @returns Nothing when the value is allowed.
	 */
	const assertAllowed = async (
		value: string,
		allowedValues: () => Promise<string[]>,
	): Promise<void> => {
		if (!(await allowedValues()).includes(value)) throw new ForbiddenError()
	}

	/**
	 * Ensure an enabled application may be used for deployment mutations.
	 * @param applicationUuid - Coolify application UUID.
	 * @returns Nothing when deployment mutations are enabled.
	 */
	const assertDeploymentAllowed = async (applicationUuid: string): Promise<void> => {
		const application = (await listConfiguredApplication({ bypassCache: true })).find(
			({ application_uuid: configuredApplicationUuid }) =>
				configuredApplicationUuid === applicationUuid,
		)
		if (!application?.deploy_enabled) throw new ForbiddenError()
	}

	/**
	 * @param filter - Optional Coolify application filter.
	 * @returns Parsed applications returned by Coolify.
	 */
	const fetchApplications = async (
		filter?: CoolifyApplicationFilter,
	): Promise<CoolifyApplication[]> =>
		coolifyApplicationsResponseSchema.parse(await request('/applications', { query: filter }))

	/** @returns All allow-listed projects visible to the Coolify token. */
	const listProjects = async (): Promise<CoolifyProject[]> => {
		const allowedProjects = await getAllowedProjects()
		const projects = coolifyProjectsResponseSchema.parse(await request('/projects'))
		return projects.filter(({ uuid }) => allowedProjects.includes(uuid))
	}

	/**
	 * @param projectUuid - Coolify project UUID.
	 * @returns The requested project.
	 */
	const getProject = async (projectUuid: string): Promise<CoolifyProject> => {
		await assertAllowed(projectUuid, getAllowedProjects)
		return coolifyProjectSchema.parse(
			await request(`/projects/${encodeURIComponent(projectUuid)}`),
		)
	}

	/**
	 * @param projectUuid - Coolify project UUID.
	 * @returns Environments in the project.
	 */
	const listEnvironments = async (projectUuid: string): Promise<CoolifyEnvironment[]> => {
		await assertAllowed(projectUuid, getAllowedProjects)
		const allowedEnvironments = await getAllowedEnvironments()
		const environments = coolifyEnvironmentsResponseSchema.parse(
			await request(`/projects/${encodeURIComponent(projectUuid)}/environments`),
		)
		return environments.filter(
			({ uuid }) => uuid !== null && allowedEnvironments.includes(uuid),
		)
	}

	/**
	 * @param projectUuid - Coolify project UUID.
	 * @param environmentUuidOrName - Environment UUID or name.
	 * @returns The requested environment.
	 */
	const getEnvironment = async (
		projectUuid: string,
		environmentUuidOrName: string,
	): Promise<CoolifyEnvironment> => {
		await assertAllowed(projectUuid, getAllowedProjects)
		const environment = coolifyEnvironmentResponseSchema.parse(
			await request(
				`/projects/${encodeURIComponent(projectUuid)}/environments/${encodeURIComponent(environmentUuidOrName)}`,
			),
		)
		if (environment.uuid === null) throw new ForbiddenError()
		await assertAllowed(environment.uuid, getAllowedEnvironments)
		return environment
	}

	/**
	 * @param filter - Optional Coolify application filter.
	 * @returns Applications matching the filter.
	 */
	const listApplications = async (
		filter?: CoolifyApplicationFilter,
	): Promise<CoolifyApplication[]> => {
		const parsedFilter = coolifyApplicationFilterSchema.parse(filter ?? {})
		const allowedApplications = await getAllowedApplications()
		const applications = await fetchApplications(parsedFilter)
		return applications.filter(({ uuid }) => allowedApplications.includes(uuid))
	}

	/**
	 * @param applicationUuid - Coolify application UUID.
	 * @param options - Optional application lookup options.
	 * @param options.bypassAllowList - Whether to fetch an application before it is locally configured.
	 * @returns The requested application.
	 */
	const getApplication = async (
		applicationUuid: string,
		{ bypassAllowList = false }: GetApplicationOptions = {},
	): Promise<CoolifyApplication> => {
		if (!bypassAllowList) await assertAllowed(applicationUuid, getAllowedApplications)
		return coolifyApplicationSchema.parse(
			await request(`/applications/${encodeURIComponent(applicationUuid)}`),
		)
	}

	/**
	 * @param path - Coolify deployment endpoint path.
	 * @param query - Optional pagination query.
	 * @returns Parsed deployments.
	 */
	const parseDeployments = async (
		path: string,
		query?: { skip: number; take: number },
	): Promise<CoolifyDeployment[]> => {
		const response = await request(path, { query })
		if (path === '/deployments') return coolifyDeploymentsListSchema.parse(response)
		return coolifyDeploymentsResponseSchema.parse(response).deployments
	}

	/**
	 * @param applicationUuid - Coolify application UUID.
	 * @returns Deployments for the application.
	 */
	const listApplicationDeployments = async (
		applicationUuid: string,
	): Promise<CoolifyDeployment[]> => {
		await assertAllowed(applicationUuid, getAllowedApplications)
		const deployments: CoolifyDeployment[] = []
		let skip = 0

		while (true) {
			const page = await parseDeployments(
				`/deployments/applications/${encodeURIComponent(applicationUuid)}`,
				{ skip, take: DEPLOYMENT_PAGE_SIZE },
			)
			deployments.push(...page)
			if (page.length < DEPLOYMENT_PAGE_SIZE) return deployments
			skip += DEPLOYMENT_PAGE_SIZE
		}
	}

	/**
	 * Read the newest deployment for an allow-listed application.
	 * @param applicationUuid - Coolify application UUID.
	 * @returns The newest deployment, or null when none exist.
	 */
	const getLatestApplicationDeployment = async (
		applicationUuid: string,
	): Promise<CoolifyDeployment | null> => {
		await assertAllowed(applicationUuid, getAllowedApplications)
		const deployments = await parseDeployments(
			`/deployments/applications/${encodeURIComponent(applicationUuid)}`,
			{ skip: 0, take: 1 },
		)
		return deployments[0] ?? null
	}

	/**
	 * @param deploymentUuid - Coolify deployment UUID.
	 * @returns The requested deployment.
	 */
	const getDeployment = async (deploymentUuid: string): Promise<CoolifyDeployment> => {
		const deployment = coolifyDeploymentSchema.parse(
			await request(`/deployments/${encodeURIComponent(deploymentUuid)}`),
		)
		await assertAllowed(deployment.coolifyApplicationId, getAllowedApplications)
		return deployment
	}

	/** @returns Allow-listed deployments currently visible to the Coolify token. */
	const listRunningDeployments = async (): Promise<CoolifyDeployment[]> => {
		const allowedApplications = await getAllowedApplications()
		const deployments = await parseDeployments('/deployments')
		return deployments.filter(({ coolifyApplicationId }) =>
			allowedApplications.includes(coolifyApplicationId),
		)
	}

	/**
	 * @param input - Deployment trigger parameters.
	 * @returns Trigger results returned by Coolify.
	 */
	const deploy = async (
		input: CoolifyDeploymentRequest,
	): Promise<CoolifyDeploymentTriggerResult[]> => {
		const parsedInput = coolifyDeploymentRequestSchema.parse(input)
		await assertAllowed(parsedInput.uuid, getAllowedApplications)
		await assertDeploymentAllowed(parsedInput.uuid)
		return coolifyDeploymentTriggerResponseSchema.parse(
			await request('/deploy', { query: parsedInput, method: 'POST' }),
		)
	}

	/**
	 * @param deploymentUuid - Coolify deployment UUID.
	 * @returns Cancellation result returned by Coolify.
	 */
	const cancelDeployment = async (
		deploymentUuid: string,
	): Promise<CoolifyDeploymentCancellationResult> => {
		const deployment = await getDeployment(deploymentUuid)
		await assertDeploymentAllowed(deployment.coolifyApplicationId)
		return coolifyDeploymentCancellationSchema.parse(
			await request(`/deployments/${encodeURIComponent(deploymentUuid)}/cancel`, {
				method: 'POST',
			}),
		)
	}

	return {
		listConfiguredApplication,
		getConfiguredApplication,
		getAllowedApplications,
		getAllowedProjects,
		getAllowedEnvironments,
		listProjects,
		getProject,
		listEnvironments,
		getEnvironment,
		listApplications,
		getApplication,
		listApplicationDeployments,
		getLatestApplicationDeployment,
		listRunningDeployments,
		getDeployment,
		deploy,
		cancelDeployment,
	}
}
