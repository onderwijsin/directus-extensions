import type { EventContext, HookExtensionContext, PrimaryKey } from '@directus/types'
import type { CollectionConfiguration } from '../../../shared/configuration/types'
import type { SluggernautEnv } from '../../configuration/env.schema'

import {
	canonicalUrlForItem,
	planCanonicalRedirect,
	selectRedirectSource,
} from '../../redirects/planner'
import { applyRedirectPlan, readRelevantRedirects } from '../../redirects/redirect-operations'
import { createRedirectService } from '../../redirects/service'

/**
 * Processes redirect history for one canonical URL transition.
 *
 * This workflow only handles URL-history changes. Archive, unarchive, and delete behavior belongs
 * to the lifecycle and deletion workflows.
 * @param input - Canonical redirect processing dependencies.
 * @returns void.
 */
export async function processCanonicalRedirect(input: {
	context: HookExtensionContext
	options: SluggernautEnv
	collection: string
	key: PrimaryKey
	existingItem: Readonly<Record<string, unknown>>
	nextItem: Readonly<Record<string, unknown>>
	configuration: CollectionConfiguration
	database: EventContext['database']
}): Promise<void> {
	const { context, options, collection, key, existingItem, nextItem, configuration, database } =
		input
	// Redirect work is optional, so disabled configurations leave the item mutation untouched.
	if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return

	// The configured permalink or slug identifies which item value owns automatic redirect history.
	const source = selectRedirectSource(configuration)
	if (source === null) return

	// Redirect history only applies when the stored and resulting canonical URLs are both usable and different.
	const oldCanonical = canonicalUrlForItem(source, existingItem)
	const newCanonical = canonicalUrlForItem(source, nextItem)
	if (oldCanonical === null || newCanonical === null || oldCanonical === newCanonical) return

	// Read the small slice of redirect history needed to resolve ownership and chain conflicts.
	const service = await createRedirectService(
		context,
		options.SLUGGERNAUT_REDIRECTS_COLLECTION,
		database,
	)
	const existingRedirects = await readRelevantRedirects(service, oldCanonical, newCanonical)
	// The pure planner decides whether to create, rewrite, deactivate, or warn about redirects.
	const plan = planCanonicalRedirect({
		oldCanonical,
		newCanonical,
		source,
		source_collection: collection,
		source_item: key,
		existingRedirects,
	})

	// Conflicts are informational; the planner preserves redirects it does not own.
	for (const warning of plan.warnings) {
		context.logger.warn(warning, {
			collection,
			field: source.field,
			code: 'redirect-conflict',
		})
	}
	// Apply the deterministic plan through the same transaction used by the source-item mutation.
	await applyRedirectPlan(service, plan)
}
