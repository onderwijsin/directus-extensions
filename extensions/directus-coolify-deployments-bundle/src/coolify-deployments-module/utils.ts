import type { DeploymentSummary } from './types'

const MODULE_PATH = '/coolify-deployments'

/**
 * Build a route to an application or deployment.
 * @param applicationId - Stable application identifier.
 * @param deploymentId - Optional deployment identifier.
 * @returns A Directus Studio route.
 */
export const deploymentPath = (applicationId: string, deploymentId?: string) =>
	`${MODULE_PATH}/applications/${encodeURIComponent(applicationId)}${deploymentId ? `/deployments/${encodeURIComponent(deploymentId)}` : ''}`

/**
 * Build a route from a deployment value.
 * @param deployment - Deployment to open.
 * @returns A Directus Studio route.
 */
export const deploymentSummaryPath = (deployment: DeploymentSummary) =>
	deploymentPath(deployment.applicationId, deployment.id)

/**
 * Format an ISO timestamp for the current locale.
 * @param value - ISO timestamp.
 * @returns Localized date and time, or an em dash.
 */
export const formatDate = (value: string | null) =>
	value
		? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
				new Date(value),
			)
		: '—'

/**
 * Format a deployment duration for compact display.
 * @param value - Duration in seconds.
 * @returns Duration label.
 */
export const formatDuration = (value: number | null) => {
	if (value === null) return '—'
	if (value > 60) return `${Math.round(value / 60)}m`
	return `${value}s`
}

/**
 * Build a GitHub repository URL from a provider repository value.
 * @param repository - Repository path or URL.
 * @returns GitHub repository URL, or null.
 */
export const repositoryUrl = (repository: string | null) => {
	if (!repository) return null
	return repository.startsWith('http') ? repository : `https://github.com/${repository}`
}
