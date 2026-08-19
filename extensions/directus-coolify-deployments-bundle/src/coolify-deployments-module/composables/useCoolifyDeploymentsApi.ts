import type {
	NormalizedDeployment,
	PublicCoolifyProject,
} from '../../shared/coolify-client/schemas'

import { useApi } from '@directus/extensions-sdk'

/**
 * Provide the authenticated Studio client for the Coolify deployment endpoint.
 * @returns API methods for the diagnostic module views.
 */
export function useCoolifyDeploymentsApi() {
	const api = useApi()

	/**
	 * Fetch configured projects.
	 * @returns Configured public projects.
	 */
	const listProjects = async (): Promise<PublicCoolifyProject[]> =>
		(await api.get<PublicCoolifyProject[]>('/coolify-deployments/projects')).data

	/**
	 * Fetch deployment history for a project.
	 * @param projectId - Stable configured project ID.
	 * @returns Normalized deployments.
	 */
	const listDeployments = async (projectId: string): Promise<NormalizedDeployment[]> =>
		(
			await api.get<NormalizedDeployment[]>(
				`/coolify-deployments/projects/${encodeURIComponent(projectId)}/deployments`,
			)
		).data

	/**
	 * Fetch one deployment.
	 * @param projectId - Stable configured project ID.
	 * @param deploymentId - Deployment UUID.
	 * @returns A normalized deployment.
	 */
	const getDeployment = async (
		projectId: string,
		deploymentId: string,
	): Promise<NormalizedDeployment> =>
		(
			await api.get<NormalizedDeployment>(
				`/coolify-deployments/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}`,
			)
		).data

	return { getDeployment, listDeployments, listProjects }
}
