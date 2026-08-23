import type { EventContext, HookExtensionContext, PrimaryKey } from '@directus/types'
import type { SluggernautEnv } from '../../configuration/env.schema'

import { createRedirectService } from '../service'
import { readManagedRedirectsForItem } from './operations'
import { planLifecycleDeactivation } from './planner'

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
		const deactivate = planLifecycleDeactivation(redirects, 'deleted')
		if (deactivate.length === 0) continue

		// Delete actions run after the source mutation and can re-enter Directus item hooks when an
		// ItemsService update is used here. Persist only the two controlled lifecycle fields directly
		// so a partial follow-up event cannot erase the auditable deletion reason.
		await database(options.SLUGGERNAUT_REDIRECTS_COLLECTION)
			.whereIn(
				'id',
				deactivate.map((redirect) => redirect.id),
			)
			.update({ is_active: false, inactive_reason: 'deleted' })
	}
}
