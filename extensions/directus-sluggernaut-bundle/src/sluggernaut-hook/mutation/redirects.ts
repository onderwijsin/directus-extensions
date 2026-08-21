import type { EventContext, HookExtensionContext } from '@directus/types'
import type { CollectionConfiguration } from '../../shared/configuration/types'
import type { SluggernautEnv } from '../configuration/env.schema'

import {
	canonicalUrlForItem,
	planArchiveReactivation,
	planCanonicalRedirect,
	planLifecycleDeactivation,
	selectRedirectSource,
} from '../redirects/planner'
import {
	applyRedirectLifecyclePlan,
	applyRedirectPlan,
	readManagedRedirectsForItem,
	readRelevantRedirects,
} from '../redirects/redirect-operations'
import { createRedirectService } from '../redirects/service'

/**
 * Processes redirect history for one canonical transition.
 * @param context - Directus extension context.
 * @param options - Validated extension options.
 * @param collection - Source collection.
 * @param key - Source item key.
 * @param existingItem - Previous item state.
 * @param nextItem - Resulting item state.
 * @param configuration - Parsed collection configuration.
 * @param database - Event transaction database handle.
 * @returns void.
 * @param input - Canonical redirect processing dependencies.
 */
export async function processCanonicalRedirect(input: {
	context: HookExtensionContext
	options: SluggernautEnv
	collection: string
	key: string | number
	existingItem: Readonly<Record<string, unknown>>
	nextItem: Readonly<Record<string, unknown>>
	configuration: CollectionConfiguration
	database: EventContext['database']
}): Promise<void> {
	const { context, options, collection, key, existingItem, nextItem, configuration, database } =
		input
	if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
	const source = selectRedirectSource(configuration)
	if (source === null) return
	const oldCanonical = canonicalUrlForItem(source, existingItem)
	const newCanonical = canonicalUrlForItem(source, nextItem)
	if (oldCanonical === null || newCanonical === null || oldCanonical === newCanonical) return

	const service = await createRedirectService(
		context,
		options.SLUGGERNAUT_REDIRECTS_COLLECTION,
		database,
	)
	const existingRedirects = await readRelevantRedirects(service, oldCanonical, newCanonical)
	const plan = planCanonicalRedirect({
		oldCanonical,
		newCanonical,
		source,
		source_collection: collection,
		source_item: String(key),
		existingRedirects,
	})
	for (const warning of plan.warnings) {
		context.logger.warn(warning, {
			collection,
			field: source.field,
			code: 'redirect-conflict',
		})
	}
	await applyRedirectPlan(service, plan)
}

/**
 * Deactivates managed redirect history after source-item deletion.
 * @param context - Directus extension context.
 * @param options - Validated extension options.
 * @param collection - Deleted source collection.
 * @param keys - Deleted item keys.
 * @param database - Event transaction database handle.
 * @returns void.
 * @param input - Deletion redirect processing dependencies.
 */
export async function processDeletedItems(input: {
	context: HookExtensionContext
	options: SluggernautEnv
	collection: string
	keys: readonly (string | number)[]
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
		const redirects = await readManagedRedirectsForItem(service, collection, String(key))
		await applyRedirectLifecyclePlan(service, {
			deactivate: planLifecycleDeactivation(redirects, 'delete'),
			reactivate: [],
		})
	}
}

/**
 * Applies archive or unarchive redirect lifecycle changes to one source item.
 * @param context - Directus extension context.
 * @param options - Validated extension options.
 * @param collection - Source collection.
 * @param key - Source item key.
 * @param lifecycle - Archive lifecycle transition.
 * @param database - Event transaction database handle.
 * @returns void.
 * @param input - Archive lifecycle processing dependencies.
 */
export async function processArchiveLifecycle(input: {
	context: HookExtensionContext
	options: SluggernautEnv
	collection: string
	key: string | number
	lifecycle: 'archive' | 'unarchive'
	database: EventContext['database']
}): Promise<void> {
	const { context, options, collection, key, lifecycle, database } = input
	if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
	const service = await createRedirectService(
		context,
		options.SLUGGERNAUT_REDIRECTS_COLLECTION,
		database,
	)
	const redirects = await readManagedRedirectsForItem(service, collection, String(key))
	await applyRedirectLifecyclePlan(service, {
		deactivate: lifecycle === 'archive' ? planLifecycleDeactivation(redirects, 'archive') : [],
		reactivate: lifecycle === 'unarchive' ? planArchiveReactivation(redirects) : [],
	})
}
