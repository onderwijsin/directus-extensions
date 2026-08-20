import type { CoolifyDeployment } from '../shared/coolify-client/schemas'

import { CoolifyDeploymentApplicationMismatchError } from './errors'

/**
 * Resolve a provider URL while allowing only HTTP(S) destinations.
 * @param value - URL supplied by Coolify or Directus.
 * @param baseUrl - Base URL used for provider-relative paths.
 * @returns Safe absolute URL, or null for invalid/non-HTTP(S) values.
 */
export const safeHttpUrl = (value: string | null, baseUrl?: string): string | null => {
	if (!value?.trim()) return null

	try {
		const url = new URL(value.trim(), baseUrl)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
		return baseUrl ? url.toString() : value.trim()
	} catch {
		return null
	}
}

/**
 * Ensure a deployment belongs to the application named by a route.
 * @param deployment - Provider deployment.
 * @param applicationUuid - Expected Coolify application UUID.
 * @returns Nothing.
 */
export const assertDeploymentBelongsToApplication = (
	deployment: CoolifyDeployment,
	applicationUuid: string,
): void => {
	if ((deployment.applicationUuid ?? deployment.applicationId) !== applicationUuid) {
		throw new CoolifyDeploymentApplicationMismatchError()
	}
}

/**
 * Resolve a Coolify deployment path against the configured Coolify host.
 * @param value - Absolute URL or provider-relative path.
 * @param options - Coolify client options containing the base URL.
 * @returns Absolute Coolify URL, or null when no path was provided.
 */
const absoluteCoolifyUrl = (value: string | null, options: { COOLIFY_URL: string }) => {
	return safeHttpUrl(value, options.COOLIFY_URL)
}

/**
 * Normalize provider deployment data for Studio consumers.
 * @param deployment - Provider deployment.
 * @param options - Coolify client options containing the base URL.
 * @returns Normalized deployment data.
 */
export const normalizeDeployment = (
	deployment: CoolifyDeployment,
	options: { COOLIFY_URL: string },
) => ({
	applicationName: null,
	environmentName: null,
	id: deployment.deploymentUuid,
	applicationId: deployment.applicationId,
	status: /queued|pending/iu.test(deployment.status)
		? 'queued'
		: /running|building|in_progress/iu.test(deployment.status)
			? 'building'
			: /success|finished|ready/iu.test(deployment.status)
				? 'ready'
				: /cancel/iu.test(deployment.status)
					? 'canceled'
					: /fail|error/iu.test(deployment.status)
						? 'error'
						: 'queued',
	rawStatus: deployment.status,
	commitSha: deployment.commit,
	commitMessage: deployment.commitMessage,
	createdAt: deployment.createdAt,
	startedAt: deployment.createdAt,
	finishedAt: deployment.finishedAt,
	duration:
		deployment.createdAt && deployment.finishedAt
			? Math.max(
					0,
					Math.round(
						(new Date(deployment.finishedAt).getTime() -
							new Date(deployment.createdAt).getTime()) /
							1000,
					),
				)
			: null,
	branch: null,
	url: absoluteCoolifyUrl(deployment.deploymentUrl, options),
	coolifyUrl: absoluteCoolifyUrl(deployment.deploymentUrl, options),
	triggeredBy: null,
})
