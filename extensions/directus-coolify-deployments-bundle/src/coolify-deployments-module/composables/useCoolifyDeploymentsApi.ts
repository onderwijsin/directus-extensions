import type { ApplicationSummary, DeploymentSummary } from '../types'

import { shallowRef } from 'vue'

import { useApi } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'

import {
	DEFAULT_DEPLOYMENT_POLL_INTERVAL_MS,
	DEPLOYMENT_POLL_INTERVAL_HEADER,
} from '../../shared/constants'

const pollingIntervalMs = shallowRef(DEFAULT_DEPLOYMENT_POLL_INTERVAL_MS)
const applicationsCollection = shallowRef('coolify_applications')

/**
 * Update the Studio polling interval from the endpoint response header.
 * @param headers - Response headers returned by Directus.
 * @returns Nothing.
 */
const updatePollingInterval = (headers: Record<string, unknown>) => {
	const value = Number(headers[DEPLOYMENT_POLL_INTERVAL_HEADER.toLowerCase()])
	if (Number.isInteger(value) && value >= 250) pollingIntervalMs.value = value
}

/**
 * Update the configured Directus collection from the endpoint response.
 * @param headers - Response headers returned by Directus.
 * @returns Nothing.
 */
const updateApplicationsCollection = (headers: Record<string, unknown>) => {
	const value = headers['x-coolify-deployments-applications-collection']
	if (typeof value === 'string' && value.length > 0) applicationsCollection.value = value
}

/**
 * Provide the authenticated Studio client for the Coolify deployment endpoint.
 * @returns API methods for the diagnostic module views.
 */
export function useCoolifyDeploymentsApi() {
	const api = useApi()
	const base = '/coolify-deployments/applications'
	/**
	 * Execute an API request and update the shared polling interval from its response headers.
	 * @param operation - API request operation.
	 * @returns Response data.
	 */
	const request = async <T>(
		operation: () => Promise<{ data: T; headers: Record<string, unknown> }>,
	) => {
		const response = await operation()
		updatePollingInterval(response.headers)
		updateApplicationsCollection(response.headers)
		return response.data
	}
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
		request(() => api.get<ApplicationSummary[]>(base))

	/**
	 * Check whether the current user can create configured applications.
	 * @returns Whether application creation is available.
	 */
	const canCreateApplications = async (): Promise<boolean> => {
		const { data } = await attempt(() =>
			api.get<{
				data?: Record<string, { create?: { access?: string } }>
			}>('/permissions/me'),
		)

		const access = data?.data.data?.[applicationsCollection.value]?.create?.access
		return access === 'full' || access === 'partial'
	}

	/**
	 * Check whether the current user can trigger deployments.
	 * @returns Whether deployment actions are available.
	 */
	const canTriggerDeployments = async (): Promise<boolean> => {
		const { data } = await attempt(() => api.get<{ canTrigger: boolean }>('/permissions'))
		return data?.data.canTrigger === true
	}

	/**
	 * Fetch deployment history for an application.
	 * @param applicationId - Stable configured application ID.
	 * @returns Normalized deployments.
	 */
	const listDeployments = async (applicationId: string): Promise<DeploymentSummary[]> =>
		request(() => api.get<DeploymentSummary[]>(`${base}/${encode(applicationId)}/deployments`))

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
		request(() =>
			api.get<DeploymentSummary>(
				`${base}/${encode(applicationId)}/deployments/${encode(deploymentId)}`,
			),
		)

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

	/**
	 * Read the current Studio polling interval.
	 * @returns Polling interval in milliseconds.
	 */
	const getPollingInterval = () => pollingIntervalMs.value
	/**
	 * Read the configured Directus application collection.
	 * @returns Configured collection name.
	 */
	const getApplicationsCollection = () => applicationsCollection.value

	return {
		cancelDeployment,
		canCreateApplications,
		canTriggerDeployments,
		deploy,
		getDeployment,
		listApplications,
		listDeployments,
		getPollingInterval,
		getApplicationsCollection,
	}
}
