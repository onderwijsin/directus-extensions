import type { EventContext, HookExtensionContext, PrimaryKey } from '@directus/types'
import type { SluggernautEnv } from '../../configuration/env.schema'

import {
	applyRedirectLifecyclePlan,
	readManagedRedirectsForItem,
} from '../../redirects/history/operations'
import { planArchiveReactivation, planLifecycleDeactivation } from '../../redirects/history/planner'
import { createRedirectService } from '../../redirects/service'

/**
 * Applies archive or unarchive changes to one source item's redirect history.
 *
 * Lifecycle processing only changes activation state and inactive reasons. It does not create or
 * rewrite redirect origins or destinations.
 * @param input - Archive lifecycle processing dependencies.
 * @returns void.
 */
export async function processArchiveLifecycle(input: {
	context: HookExtensionContext
	options: SluggernautEnv
	collection: string
	key: PrimaryKey
	lifecycle: 'archive' | 'unarchive'
	database: EventContext['database']
}): Promise<void> {
	const { context, options, collection, key, lifecycle, database } = input
	if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return

	try {
		const service = await createRedirectService(
			context,
			options.SLUGGERNAUT_REDIRECTS_COLLECTION,
			database,
		)
		const redirects = await readManagedRedirectsForItem(service, collection, key)
		await applyRedirectLifecyclePlan(service, {
			deactivate:
				lifecycle === 'archive' ? planLifecycleDeactivation(redirects, 'archived') : [],
			reactivate: lifecycle === 'unarchive' ? planArchiveReactivation(redirects) : [],
		})
	} catch (error) {
		// Redirect lifecycle history is optional and must not block the archive transition itself.
		context.logger.warn(
			'Sluggernaut skipped redirect lifecycle processing because the redirect collection is unavailable or incompatible.',
			{
				collection,
				redirectCollection: options.SLUGGERNAUT_REDIRECTS_COLLECTION,
				lifecycle,
				code: 'redirect-runtime-unavailable',
				error,
			},
		)
	}
}
