import type {
	CoolifyApplication,
	CoolifyApplicationFilter,
	CoolifyDeployment,
	CoolifyDeploymentCancellationResult,
	CoolifyDeploymentRequest,
	CoolifyDeploymentTriggerResult,
	CoolifyEnvironment,
	CoolifyProject,
	CoolifyDeploymentsOptions,
} from './schemas'
import type { CoolifyDeploymentClient } from './types'
import type { DirectusCoolifyApplication } from './types'

import { ForbiddenError } from '@directus/errors'
import { initializeCache } from '@onderwijsin/directus-extension-utils/server'
import { ofetch } from 'ofetch'

import { LIST_APPLICATION_CACHE_DURATION_MS } from '../constants'

export type {
	CoolifyDeploymentClient,
	DirectusCoolifyApplication,
	CoolifyClientContext,
} from './types'

import type { CoolifyClientContext } from './types'

import {
	getAllowedApplications as resolveAllowedApplications,
	getAllowedEnvirnoments as resolveAllowedEnvirnoments,
	getAllowedProjects as resolveAllowedProjects,
} from './resolvers'
import {
	coolifyApplicationSchema,
	coolifyApplicationsResponseSchema,
	coolifyDeploymentCancellationSchema,
	coolifyDeploymentsResponseSchema,
	coolifyDeploymentSchema,
	coolifyDeploymentTriggerResponseSchema,
	coolifyEnvironmentResponseSchema,
	coolifyEnvironmentsResponseSchema,
	coolifyProjectSchema,
	coolifyProjectsResponseSchema,
	coolifyApplicationFilterSchema,
	coolifyDeploymentRequestSchema,
} from './schemas'

const API_PREFIX = '/api/v1'
const CONFIGURED_APPLICATIONS_CACHE_KEY = 'coolify-deployments:configured-applications'
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
		? initializeCache(context, { ttl: LIST_APPLICATION_CACHE_DURATION_MS })
		: null

	/** @returns Allow-listed applications from Directus. */
	const listConfiguredApplication = async (): Promise<DirectusCoolifyApplication[]> => {
		if (!context)
			throw new Error('Directus context is required to list configured applications')
		const cached = await cache?.get<DirectusCoolifyApplication[]>(
			CONFIGURED_APPLICATIONS_CACHE_KEY,
		)
		if (cached) return cached

		const applications = await new context.services.ItemsService<DirectusCoolifyApplication>(
			options.COOLIFY_APPLICATIONS_COLLECTION,
			{
				schema: await context.getSchema(),
				accountability: null,
			},
		).readMany([], { limit: -1, filter: { enabled: { _eq: true } } })

		await cache?.set(CONFIGURED_APPLICATIONS_CACHE_KEY, applications)
		return applications
	}

	/** @returns Unique allowed Coolify application UUIDs. */
	const getAllowedApplications = () => resolveAllowedApplications(listConfiguredApplication)

	/** @returns Unique allowed Coolify project UUIDs. */
	const getAllowedProjects = () => resolveAllowedProjects(listConfiguredApplication)

	/** @returns Unique allowed Coolify environment UUIDs. */
	const getAllowedEnvirnoments = () => resolveAllowedEnvirnoments(listConfiguredApplication)

	/**
	 * Create a ofetch client with bearer header
	 */
	const request = ofetch.create({
		baseURL: `${baseUrl}${API_PREFIX}`,
		headers: {
			Authorization: `Bearer ${options.COOLIFY_TOKEN}`,
		},
	})

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
		const application = (await listConfiguredApplication()).find(
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
		const allowedEnvironments = await getAllowedEnvirnoments()
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
		if (environmentUuidOrName.length > 0) {
			const allowedEnvironments = await getAllowedEnvirnoments()
			if (allowedEnvironments.includes(environmentUuidOrName)) {
				return coolifyEnvironmentResponseSchema.parse(
					await request(
						`/projects/${encodeURIComponent(projectUuid)}/environments/${encodeURIComponent(environmentUuidOrName)}`,
					),
				)
			}
		}

		const environment = coolifyEnvironmentResponseSchema.parse(
			await request(
				`/projects/${encodeURIComponent(projectUuid)}/environments/${encodeURIComponent(environmentUuidOrName)}`,
			),
		)
		if (environment.uuid === null) throw new ForbiddenError()
		await assertAllowed(environment.uuid, getAllowedEnvirnoments)
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
	 * @returns The requested application.
	 */
	const getApplication = async (applicationUuid: string): Promise<CoolifyApplication> => {
		await assertAllowed(applicationUuid, getAllowedApplications)
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
		return coolifyDeploymentsResponseSchema.parse(await request(path, { query }))
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

	/** @returns Allow-listed deployments currently visible to the Coolify token. */
	const listRunningDeployments = async (): Promise<CoolifyDeployment[]> => {
		const allowedApplications = await getAllowedApplications()
		const deployments = await parseDeployments('/deployments')
		return deployments.filter(({ applicationId }) =>
			allowedApplications.includes(applicationId),
		)
	}

	/**
	 * @param deploymentUuid - Coolify deployment UUID.
	 * @returns The requested deployment.
	 */
	const getDeployment = async (deploymentUuid: string): Promise<CoolifyDeployment> => {
		const deployment = coolifyDeploymentSchema.parse(
			await request(`/deployments/${encodeURIComponent(deploymentUuid)}`),
		)
		await assertAllowed(deployment.applicationId, getAllowedApplications)
		return deployment
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
			await request('/deploy', { query: parsedInput }),
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
		await assertDeploymentAllowed(deployment.applicationId)
		return coolifyDeploymentCancellationSchema.parse(
			await request(`/deployments/${encodeURIComponent(deploymentUuid)}/cancel`, {
				method: 'POST',
			}),
		)
	}

	return {
		listConfiguredApplication,
		getAllowedApplications,
		getAllowedEnvirnoments,
		getAllowedProjects,
		listProjects,
		getProject,
		listEnvironments,
		getEnvironment,
		listApplications,
		getApplication,
		listApplicationDeployments,
		listRunningDeployments,
		getDeployment,
		deploy,
		cancelDeployment,
	}
}
