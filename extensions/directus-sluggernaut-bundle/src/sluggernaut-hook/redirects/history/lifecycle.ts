import type { EventContext, HookExtensionContext, PrimaryKey } from '@directus/types'
import type { SluggernautEnv } from '../../configuration/env.schema'

import { isDirectusError } from '@directus/errors'

import { sluggernautRedirectProcessingError } from '../../../shared/errors'
import { withMutationSource } from '../direct-mutations/mutation-source'
import { createRedirectService } from '../service'
import { applyRedirectLifecyclePlan, readManagedRedirectsForItem } from './operations'
import { planArchiveReactivation, planLifecycleDeactivation } from './planner'

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
		await withMutationSource('internal', () =>
			applyRedirectLifecyclePlan(service, {
				deactivate:
					lifecycle === 'archive' ? planLifecycleDeactivation(redirects, 'archived') : [],
				reactivate: lifecycle === 'unarchive' ? planArchiveReactivation(redirects) : [],
			}),
		)
	} catch (error) {
		if (isDirectusError(error)) throw error
		const details = {
			collection,
			redirectCollection: options.SLUGGERNAUT_REDIRECTS_COLLECTION,
			lifecycle,
			code: 'redirect-processing-failed',
			error,
		}
		if (options.SLUGGERNAUT_THROW_ON_PROCESSING_ERROR !== false) {
			context.logger.error(
				'Sluggernaut failed to maintain redirect lifecycle history.',
				details,
			)
			throw sluggernautRedirectProcessingError(
				`Sluggernaut could not update redirect history while trying to ${lifecycle} this item. The item was not saved. Please contact an administrator.`,
			)
		}
		context.logger.warn(
			'Sluggernaut skipped redirect lifecycle processing after an unexpected failure.',
			details,
		)
	}
}
