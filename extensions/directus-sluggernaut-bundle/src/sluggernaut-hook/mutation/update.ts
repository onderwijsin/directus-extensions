import type { EventContext, HookExtensionContext, PrimaryKey } from '@directus/types'
import type { CollectionConfiguration } from '../../shared/configuration/types'
import type { SluggernautEnv } from '../configuration/env.schema'

import { processCanonicalRedirect } from '../redirects/history/canonical'
import { processArchiveLifecycle } from '../redirects/history/lifecycle'
import { archiveLifecycle, type ArchiveSettings } from './archive'
import { coordinateMutation } from './coordinator'
import { readExistingItem, relevantFields } from './items'

/**
 * Validates and processes one item update after its boundary checks succeed.
 * @param context - Directus extension context.
 * @param options - Validated extension options.
 * @param payload - Incoming mutation payload.
 * @param collection - Source collection.
 * @param key - Source item key.
 * @param configuration - Parsed collection configuration.
 * @param archiveSettings - Optional archive metadata.
 * @param archiveFieldChanged - Whether the archive field is present in the payload.
 * @param hasRelevantFields - Whether derived fields are present in the payload.
 * @param eventContext - Directus event context.
 * @returns The original payload or the coordinated mutation payload.
 * @param input - Update processing dependencies.
 */
export async function processItemUpdate(input: {
	context: HookExtensionContext
	options: SluggernautEnv
	payload: Record<string, unknown>
	collection: string
	key: PrimaryKey
	configuration: CollectionConfiguration
	archiveSettings: ArchiveSettings | null
	archiveFieldChanged: boolean
	hasRelevantFields: boolean
	eventContext: EventContext
}): Promise<Record<string, unknown>> {
	const {
		context,
		options,
		payload,
		collection,
		key,
		configuration,
		archiveSettings,
		archiveFieldChanged,
		hasRelevantFields,
		eventContext,
	} = input
	const existingItem = await readExistingItem(
		context,
		collection,
		key,
		[
			...relevantFields(configuration),
			...(archiveSettings === null ? [] : [archiveSettings.archive_field]),
		],
		eventContext,
	)

	if (archiveSettings !== null && archiveFieldChanged) {
		const lifecycle = archiveLifecycle(
			existingItem[archiveSettings.archive_field],
			payload[archiveSettings.archive_field],
			archiveSettings,
		)
		if (lifecycle !== null) {
			// Lifecycle processing only changes the active state/reason of this item's existing redirect history.
			// Await it so the mutation completes before canonical planning; fire-and-forget could race the transaction.
			await processArchiveLifecycle({
				context,
				options,
				collection,
				key,
				lifecycle,
				database: eventContext.database,
			})
		}
	}
	if (!hasRelevantFields) return payload

	const result = coordinateMutation({
		kind: 'update',
		payload,
		existingItem,
		configuration,
	})
	// Canonical processing creates or rewrites URL history when the item's canonical value changes;
	// it does not decide whether the source item is archived or deleted.
	await processCanonicalRedirect({
		context,
		options,
		collection,
		key,
		existingItem,
		nextItem: { ...existingItem, ...result.payload },
		configuration,
		database: eventContext.database,
	})

	return result.payload
}
