import type { EventContext, HookExtensionContext, PrimaryKey } from '@directus/types'
import type { SluggernautEnv } from '../../configuration/env.schema'

import { planLifecycleDeactivation } from '../../redirects/planner'
import {
	applyRedirectLifecyclePlan,
	readManagedRedirectsForItem,
} from '../../redirects/redirect-operations'
import { createRedirectService } from '../../redirects/service'

/**
 * Deactivates managed redirect history after source-item deletion.
 * @param input - Deletion redirect processing dependencies.
 * @returns void.
 */
export async function processDeletedItems(input: {
	context: HookExtensionContext
	options: SluggernautEnv
	collection: string
	keys: readonly PrimaryKey[]
	database: EventContext['database']
}): Promise<void> {
	const { context, options, collection, keys, database } = input
	if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return

	const service = await createRedirectService(
		context,
		options.SLUGGERNAUT_REDIRECTS_COLLECTION,
		database,
	)
	for (const key of keys) {
		const redirects = await readManagedRedirectsForItem(service, collection, key)
		await applyRedirectLifecyclePlan(service, {
			deactivate: planLifecycleDeactivation(redirects, 'delete'),
			reactivate: [],
		})
	}
}
