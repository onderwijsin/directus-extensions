import type { CoolifyDeploymentClient, DirectusCoolifyApplication } from '../shared/coolify-client'

import { COOLIFY_DASHBOARD_CONCURRENCY } from '../shared/constants'
import { normalizeDeployment, safeHttpUrl } from './helpers'

type ApplicationSummaryClient = Pick<
	CoolifyDeploymentClient,
	'getApplication' | 'getLatestApplicationDeployment'
>

/**
 * Load provider metadata and the latest deployment for one application.
 * @param client - Coolify client used for provider reads.
 * @param item - Configured application record.
 * @param coolifyUrl - Coolify base URL used to normalize deployment links.
 * @returns Application summary.
 */
export async function loadApplicationSummary(
	client: ApplicationSummaryClient,
	item: DirectusCoolifyApplication,
	coolifyUrl: string,
) {
	const provider = await client.getApplication(item.application_uuid)
	const latest = await client.getLatestApplicationDeployment(item.application_uuid)
	return {
		directusApplicationId: item.directusApplicationId,
		name: item.name || provider.name,
		url: safeHttpUrl(item.production_url ?? provider.fqdn),
		projectName: item.project_name,
		environmentName: item.environment_name,
		state: provider.status,
		gitBranch: provider.gitBranch,
		gitCommitSha: provider.gitCommitSha,
		gitRepository: provider.gitRepository,
		buildPack: provider.buildPack,
		serverName: provider.serverName,
		latestDeployment: latest
			? {
					...normalizeDeployment(latest, { COOLIFY_URL: coolifyUrl }),
					directusApplicationId: item.directusApplicationId,
				}
			: null,
	}
}

/**
 * Resolve application summaries with bounded provider concurrency.
 * @param client - Coolify client used for provider reads.
 * @param configured - Configured application records.
 * @param coolifyUrl - Coolify base URL used to normalize deployment links.
 * @returns Application summaries in configuration order.
 */
export async function loadApplicationSummaries(
	client: ApplicationSummaryClient,
	configured: DirectusCoolifyApplication[],
	coolifyUrl: string,
) {
	const results = new Array<Awaited<ReturnType<typeof loadApplicationSummary>>>(configured.length)
	let nextIndex = 0

	/**
	 * Process assigned applications until the shared queue is empty.
	 * @returns Nothing.
	 */
	const worker = async () => {
		while (nextIndex < configured.length) {
			const index = nextIndex
			nextIndex += 1
			const item = configured[index]
			if (item) results[index] = await loadApplicationSummary(client, item, coolifyUrl)
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(COOLIFY_DASHBOARD_CONCURRENCY, configured.length) }, () =>
			worker(),
		),
	)

	return results.filter(
		(result): result is Awaited<ReturnType<typeof loadApplicationSummary>> =>
			result !== undefined,
	)
}
