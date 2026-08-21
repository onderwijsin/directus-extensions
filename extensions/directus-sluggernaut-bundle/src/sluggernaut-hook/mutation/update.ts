import type { EventContext, HookExtensionContext } from '@directus/types'
import type { CollectionConfiguration } from '../../shared/configuration/types'
import type { SluggernautEnv } from '../configuration/env.schema'

import { archiveLifecycle, type ArchiveSettings } from './archive'
import { coordinateMutation } from './coordinator'
import { readExistingItem, relevantFields } from './items'
import { processArchiveLifecycle, processCanonicalRedirect } from './redirects'

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
	key: string | number
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
