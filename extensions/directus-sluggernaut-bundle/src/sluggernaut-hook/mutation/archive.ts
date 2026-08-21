import type { HookExtensionContext } from '@directus/types'

import { z } from 'zod'

/** Archive configuration read from Directus collection metadata. */
export interface ArchiveSettings {
	field: string
	archiveValue: unknown
	unarchiveValue: unknown
}

const collectionMetadataSchema = z.looseObject({
	meta: z
		.looseObject({
			archive_field: z.string().optional(),
			archive_value: z.unknown().optional(),
			unarchive_value: z.unknown().optional(),
		})
		.nullable()
		.optional(),
})

/**
 * Reads Directus-native archive metadata for one collection.
 * @param context - Directus extension context.
 * @param collection - Directus collection key.
 * @returns Archive metadata when configured, otherwise null.
 */
export async function discoverArchiveSettings(
	context: HookExtensionContext,
	collection: string,
): Promise<ArchiveSettings | null> {
	const schema = await context.getSchema()
	const collectionsService = new context.services.CollectionsService({
		schema,
		accountability: null,
	})
	const result = await collectionsService.readOne(collection)
	const parsed = collectionMetadataSchema.safeParse(result)
	if (!parsed.success) return null
	const meta = parsed.data.meta
	if (meta?.archive_field === undefined) return null
	return {
		field: meta.archive_field,
		archiveValue: meta.archive_value,
		unarchiveValue: meta.unarchive_value,
	}
}

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
	if (nextValue === settings.archiveValue && previousValue !== settings.archiveValue) {
		return 'archive'
	}
	if (nextValue === settings.unarchiveValue && previousValue === settings.archiveValue) {
		return 'unarchive'
	}
	return null
}
