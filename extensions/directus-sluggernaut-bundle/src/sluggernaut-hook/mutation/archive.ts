import type { HookExtensionContext } from '@directus/types'

import { hasKey, isRecord, isString } from '@onderwijsin/directus-extension-utils'

/**
 * Narrows a record to one with a string-valued property.
 * @param value - Record to inspect.
 * @param key - Property key to inspect.
 * @returns Whether the property exists and contains a string.
 */
function hasStringProperty<Key extends string>(
	value: Record<string, unknown>,
	key: Key,
): value is Record<string, unknown> & Record<Key, string> {
	return Object.hasOwn(value, key) && isString(value[key])
}

/**
 * Reads Directus-native archive metadata for one collection.
 * @param context - Directus extension context.
 * @param collection - Directus collection key.
 * @returns Archive metadata when configured, otherwise null.
 */
export async function discoverArchiveSettings(context: HookExtensionContext, collection: string) {
	const schema = await context.getSchema()
	const collectionsService = new context.services.CollectionsService({
		schema,
		accountability: null,
	})
	const { meta } = await collectionsService.readOne(collection)
	if (!isRecord(meta) || !hasStringProperty(meta, 'archive_field')) return null
	return meta
}

export type ArchiveSettings = NonNullable<Awaited<ReturnType<typeof discoverArchiveSettings>>>

/**
 * Resolves an archive field change into its redirect lifecycle transition.
 * @param previousValue - Stored archive field value.
 * @param nextValue - Incoming archive field value.
 * @param settings - Collection archive configuration.
 * @returns The lifecycle transition, or null when no transition occurred.
 */
export function archiveLifecycle(
	previousValue: unknown,
	nextValue: unknown,
	settings: ArchiveSettings,
): 'archive' | 'unarchive' | null {
	const archiveValue = hasKey(settings, 'archive_value') ? settings.archive_value : undefined
	const unarchiveValue = hasKey(settings, 'unarchive_value')
		? settings.unarchive_value
		: undefined
	if (nextValue === archiveValue && previousValue !== archiveValue) {
		return 'archive'
	}
	if (nextValue === unarchiveValue && previousValue === archiveValue) {
		return 'unarchive'
	}
	return null
}
