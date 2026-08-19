import type { ApplicationSummary, DeploymentSummary } from '../types'

import { useApi } from '@directus/extensions-sdk'

/**
 * Provide the authenticated Studio client for the Coolify deployment endpoint.
 * @returns API methods for the diagnostic module views.
 */
export function useCoolifyDeploymentsApi() {
	const api = useApi()
	const base = '/coolify-deployments/applications'
	/**
	 * Encode a route parameter.
	 * @param value - Route parameter.
	 * @returns Encoded value.
	 */
	const encode = (value: string) => encodeURIComponent(value)

	/**
	 * Fetch configured applications.
	 * @returns Configured applications.
	 */
	const listApplications = async (): Promise<ApplicationSummary[]> =>
		(await api.get<ApplicationSummary[]>(base)).data

	/**
	 * Check whether the current user can create configured applications.
	 * @returns Whether application creation is available.
	 */
	const canCreateApplications = async (): Promise<boolean> => {
		try {
			const response = await api.get<{
				data?: Record<string, { create?: { access?: string } }>
			}>('/permissions/me')
			const access = response.data.data?.coolify_applications?.create?.access
			return access === 'full' || access === 'partial'
		} catch {
			return false
		}
	}

	/**
	 * Fetch deployment history for an application.
	 * @param applicationId - Stable configured application ID.
	 * @returns Normalized deployments.
	 */
	const listDeployments = async (applicationId: string): Promise<DeploymentSummary[]> =>
		(await api.get<DeploymentSummary[]>(`${base}/${encode(applicationId)}/deployments`)).data

	/**
	 * Fetch one deployment.
	 * @param applicationId - Stable configured application ID.
	 * @param deploymentId - Deployment identifier.
	 * @returns A normalized deployment.
	 */
	const getDeployment = async (
		applicationId: string,
		deploymentId: string,
	): Promise<DeploymentSummary> =>
		(
			await api.get<DeploymentSummary>(
				`${base}/${encode(applicationId)}/deployments/${encode(deploymentId)}`,
			)
		).data

	/**
	 * Trigger a deployment for a configured application.
	 * @param applicationId - Stable configured application ID.
	 * @returns Created deployment identifier.
	 */
	const deploy = async (applicationId: string): Promise<string> =>
		(
			await api.post<{ id: string }>(`${base}/${encode(applicationId)}/deployments`, {
				force: true,
			})
		).data.id

	/**
	 * Cancel an active deployment.
	 * @param applicationId - Stable configured application ID.
	 * @param deploymentId - Deployment identifier.
	 * @returns Nothing.
	 */
	const cancelDeployment = async (applicationId: string, deploymentId: string): Promise<void> => {
		await api.post(
			`${base}/${encode(applicationId)}/deployments/${encode(deploymentId)}/cancel`,
		)
	}

	return {
		cancelDeployment,
		canCreateApplications,
		deploy,
		getDeployment,
		listApplications,
		listDeployments,
	}
}
