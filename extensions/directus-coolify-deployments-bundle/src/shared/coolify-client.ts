import type {
	CoolifyProject,
	DeploymentPagination,
	NormalizedDeployment,
	PublicCoolifyProject,
} from './types'

import {
	coolifyDeployResponseSchema,
	coolifyDeploymentsResponseSchema,
	deploymentPaginationSchema,
	type CoolifyDeploymentResponse,
	type CoolifyDeploymentsOptions,
} from './schemas'

const API_PREFIX = '/api/v1'

export interface CoolifyDeploymentClient {
	listProjects: () => PublicCoolifyProject[]
	listDeployments: (
		project: CoolifyProject,
		pagination?: DeploymentPagination,
	) => Promise<NormalizedDeployment[]>
	getDeployment: (project: CoolifyProject, deploymentId: string) => Promise<NormalizedDeployment>
	deploy: (project: CoolifyProject, force: boolean) => Promise<NormalizedDeployment>
	resolveProject: (projectId: string) => CoolifyProject | undefined
}

/**
 * Map Coolify's status vocabulary to the extension's stable status values.
 * @param status - Raw Coolify status.
 * @returns Normalized deployment status.
 */
const normalizeStatus = (status: string): NormalizedDeployment['status'] => {
	const value = status.toLowerCase()

	if (value.includes('queue')) return 'queued'
	if (value.includes('run') || value.includes('progress') || value.includes('in_progress')) {
		return 'running'
	}
	if (value.includes('success') || value.includes('finish') || value.includes('completed')) {
		return 'success'
	}
	if (value.includes('cancel')) return 'cancelled'
	if (value.includes('fail') || value.includes('error')) return 'failed'

	return 'unknown'
}

/**
 * Normalize optional provider strings to nullable values.
 * @param value - Optional provider value.
 * @returns A string or null.
 */
const nullableString = (value: string | null | undefined): string | null => value ?? null

/**
 * Calculate deployment duration from provider timestamps.
 * @param startedAt - Deployment start timestamp.
 * @param finishedAt - Deployment finish timestamp.
 * @returns Duration in milliseconds, or null when unavailable.
 */
const durationBetween = (startedAt: string | null, finishedAt: string | null): number | null => {
	if (startedAt === null || finishedAt === null) return null

	const duration = Date.parse(finishedAt) - Date.parse(startedAt)
	return Number.isFinite(duration) && duration >= 0 ? duration : null
}

/**
 * Convert a validated Coolify deployment to the extension-owned model.
 * @param projectId - Stable configured project ID.
 * @param deployment - Validated Coolify deployment.
 * @returns Normalized deployment.
 */
const normalizeDeployment = (
	projectId: string,
	deployment: CoolifyDeploymentResponse,
): NormalizedDeployment => {
	const startedAt = nullableString(deployment.created_at)
	const status = normalizeStatus(deployment.status)
	const finishedAt =
		status === 'queued' || status === 'running' ? null : nullableString(deployment.updated_at)

	return {
		id: deployment.deployment_uuid,
		projectId,
		status,
		rawStatus: deployment.status,
		commitSha: nullableString(deployment.commit),
		commitMessage: nullableString(deployment.commit_message),
		deploymentUrl: nullableString(deployment.deployment_url),
		startedAt,
		finishedAt,
		duration: durationBetween(startedAt, finishedAt),
	}
}

/**
 * Create a server-side client for the documented Coolify deployment API.
 * @param options - Validated Coolify deployment configuration.
 * @param fetchImplementation - HTTP implementation, injectable for tests.
 * @returns A configured Coolify deployment client.
 */
export function createCoolifyDeploymentClient(
	options: CoolifyDeploymentsOptions,
	fetchImplementation: typeof fetch = fetch,
): CoolifyDeploymentClient {
	const baseUrl = options.COOLIFY_URL.endsWith('/')
		? options.COOLIFY_URL.slice(0, -1)
		: options.COOLIFY_URL

	/**
	 * Make an authenticated request to the Coolify API.
	 * @param path - API path below `/api/v1`.
	 * @returns Parsed JSON response.
	 */
	const request = async (path: string): Promise<unknown> => {
		const response = await fetchImplementation(`${baseUrl}${API_PREFIX}${path}`, {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${options.COOLIFY_TOKEN}`,
			},
		})
		const body = await response.text()

		if (!response.ok) {
			throw new Error(`Coolify API request failed with status ${response.status}`)
		}

		if (body.length === 0) return undefined

		try {
			const parsed: unknown = JSON.parse(body)
			return parsed
		} catch {
			throw new Error('Coolify API returned invalid JSON')
		}
	}

	/**
	 * List configured projects without exposing Coolify resource UUIDs.
	 * @returns Public project metadata.
	 */
	const listProjects = (): PublicCoolifyProject[] =>
		options.COOLIFY_PROJECTS.map(({ id, name, productionUrl }) => ({ id, name, productionUrl }))

	/**
	 * Resolve a stable project ID from server-side configuration.
	 * @param projectId - Stable configured project ID.
	 * @returns The configured project, if found.
	 */
	const resolveProject = (projectId: string): CoolifyProject | undefined =>
		options.COOLIFY_PROJECTS.find(({ id }) => id === projectId)

	/**
	 * List deployments for one configured Coolify application.
	 * @param project - Configured project.
	 * @param pagination - Requested result window.
	 * @returns Normalized deployments.
	 */
	const listDeployments = async (
		project: CoolifyProject,
		pagination = { skip: 0, take: 10 },
	): Promise<NormalizedDeployment[]> => {
		const { skip, take } = deploymentPaginationSchema.parse(pagination)
		const response = await request(
			`/deployments/applications/${encodeURIComponent(project.resourceUuid)}?skip=${skip}&take=${take}`,
		)
		const deployments = coolifyDeploymentsResponseSchema.parse(response)
		return deployments.map((deployment) => normalizeDeployment(project.id, deployment))
	}

	/**
	 * Read and normalize one deployment.
	 * @param project - Configured project.
	 * @param deploymentId - Coolify deployment UUID.
	 * @returns A normalized deployment.
	 */
	const getDeployment = async (
		project: CoolifyProject,
		deploymentId: string,
	): Promise<NormalizedDeployment> => {
		const response = await request(`/deployments/${encodeURIComponent(deploymentId)}`)
		const deployment = coolifyDeploymentsResponseSchema.parse([response])[0]
		if (!deployment) throw new Error('Coolify API returned an empty deployment response')
		if (deployment.application_id && deployment.application_id !== project.resourceUuid) {
			throw new Error('Coolify deployment does not belong to the configured project')
		}
		return normalizeDeployment(project.id, deployment)
	}

	/**
	 * Trigger a deployment through Coolify's deploy endpoint.
	 * @param project - Configured project.
	 * @param force - Whether to force a rebuild without cache.
	 * @returns The initial normalized deployment.
	 */
	const deploy = async (
		project: CoolifyProject,
		force: boolean,
	): Promise<NormalizedDeployment> => {
		const query = new URLSearchParams({
			force: String(force),
			uuid: project.resourceUuid,
		})
		const response = coolifyDeployResponseSchema.parse(await request(`/deploy?${query}`))
		const deployment = response.deployments[0]
		if (!deployment) throw new Error('Coolify API returned no deployment')

		return {
			id: deployment.deployment_uuid,
			projectId: project.id,
			status: 'unknown',
			rawStatus: deployment.message,
			commitSha: null,
			commitMessage: null,
			deploymentUrl: null,
			startedAt: null,
			finishedAt: null,
			duration: null,
		}
	}

	return { deploy, getDeployment, listDeployments, listProjects, resolveProject }
}
