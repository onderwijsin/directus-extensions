/**
 * @fileoverview Registers item filters and redirect lifecycle actions.
 *
 * Registers Sluggernaut's item filters and redirect lifecycle actions.
 *
 * Create/update filters derive values before Directus persists them. Update and delete actions
 * then use the event transaction to maintain redirect history, while archive transitions suspend
 * and restore managed redirects without affecting redirects owned by other systems.
 */
import type { EventContext, HookExtensionContext, RegisterFunctions } from '@directus/types'
import type { FieldCache } from '../../server/field-reader'
import type { SluggernautEnv } from '../configuration/env.schema'

import {
	hasKey,
	isArray,
	isNumber,
	isRecord,
	isString,
} from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import { discoverCollectionConfiguration } from '../../shared/configuration/ordering'
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
} from '../redirects/service'
import { createRedirectStore } from '../redirects/store'
import { coordinateMutation } from './coordinator'

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

interface ArchiveSettings {
	field: string
	archiveValue: unknown
	unarchiveValue: unknown
}

/**
 * Resolves an archive field change into its redirect lifecycle transition.
 * @param previousValue - Stored archive field value.
 * @param nextValue - Incoming archive field value.
 * @param settings - Collection archive configuration.
 * @returns The lifecycle transition, or null when no transition occurred.
 */
function archiveLifecycle(
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

/**
 * Coordinates a single item in a bulk create payload.
 * @param item - Incoming bulk-create item.
 * @param configuration - Parsed collection configuration.
 * @returns The item with derived values applied.
 */
function coordinateCreatedItem(
	item: unknown,
	configuration: ReturnType<typeof discoverCollectionConfiguration>,
): Record<string, unknown> {
	if (!isRecord(item)) throw new Error('Sluggernaut bulk creates require item objects.')
	return coordinateMutation({
		kind: 'create',
		payload: item,
		existingItem: {},
		configuration,
	}).payload
}

/**
 * Collects the minimum field set required by the mutation coordinator.
 * @param configuration - Parsed collection configuration.
 * @returns Deduplicated later-read candidates.
 */
function relevantFields(
	configuration: ReturnType<typeof discoverCollectionConfiguration>,
): string[] {
	return [
		...new Set([
			...configuration.slugs.flatMap((field) => [field.field, ...field.options.sourceFields]),
			...configuration.permalinks.flatMap((field) => [
				field.field,
				...(field.options.slugField ? [field.options.slugField] : []),
			]),
		]),
	]
}

/**
 * Registers item mutation and redirect hooks.
 *
 * Derives configured fields and coordinates redirect history across item mutations.
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @param options - Validated extension options.
 * @param fieldCache - Collection-scoped field metadata cache.
 * @returns Nothing.
 */
export function registerSluggernautItemHooks(
	hook: RegisterFunctions,
	context: HookExtensionContext,
	options: SluggernautEnv,
	fieldCache: FieldCache,
): void {
	/**
	 * Reads and validates field configuration for one collection.
	 * @param collection - Directus collection key.
	 * @returns Parsed collection configuration.
	 */
	async function discoverConfiguration(collection: string) {
		const fields = await fieldCache.read(collection)
		return discoverCollectionConfiguration(fields)
	}

	/**
	 * Reads Directus-native archive metadata for one collection.
	 * @param collection - Directus collection key.
	 * @returns Archive metadata when configured, otherwise null.
	 */
	async function discoverArchiveSettings(collection: string) {
		const schema = await context.getSchema()
		const itemsService = new context.services.ItemsService('directus_collections', {
			schema,
			accountability: null,
		})
		const result = await itemsService.readOne(collection, { fields: ['meta'] })
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
	 * Reads only fields required for the current derivation.
	 * @param collection - Directus collection key.
	 * @param key - Item primary key.
	 * @param fields - Required field keys.
	 * @param database - Event transaction database handle.
	 * @param accountability - Accountability for the read.
	 * @returns Existing item values.
	 */
	async function readExistingItem(
		collection: string,
		key: string | number,
		fields: readonly string[],
		database: EventContext['database'],
		accountability: EventContext['accountability'],
	) {
		const schema = await context.getSchema()
		const itemsService = new context.services.ItemsService(collection, {
			schema,
			accountability,
			knex: database,
		})
		const item = await itemsService.readOne(key, { fields: [...new Set(fields)] })
		if (!isRecord(item)) throw new Error('Sluggernaut could not read the existing item.')
		return item
	}

	/**
	 * Emits structured warnings for invalid or duplicate field configuration.
	 * @param collection - Directus collection key.
	 * @param configuration - Parsed collection configuration.
	 * @returns void
	 */
	function logConfigurationWarnings(
		collection: string,
		configuration: ReturnType<typeof discoverCollectionConfiguration>,
	) {
		for (const warning of configuration.warnings) {
			context.logger.warn(warning.message, {
				collection,
				field: warning.field,
				code: warning.code,
			})
		}
	}

	/**
	 * Checks whether the payload can affect a Sluggernaut-derived value.
	 * @param payload - Incoming mutation payload.
	 * @param configuration - Parsed collection configuration.
	 * @returns Whether a relevant field is present.
	 */
	function hasRelevantPayloadField(
		payload: Readonly<Record<string, unknown>>,
		configuration: ReturnType<typeof discoverCollectionConfiguration>,
	): boolean {
		return relevantFields(configuration).some((field) => hasKey(payload, field))
	}

	/**
	 * Processes redirect history for one canonical transition.
	 * @param collection - Source collection.
	 * @param key - Source item key.
	 * @param existingItem - Previous item state.
	 * @param nextItem - Resulting item state.
	 * @param configuration - Parsed collection configuration.
	 * @param database - Event transaction database handle.
	 * @returns void
	 */
	async function processRedirects(
		collection: string,
		key: string | number,
		existingItem: Readonly<Record<string, unknown>>,
		nextItem: Readonly<Record<string, unknown>>,
		configuration: ReturnType<typeof discoverCollectionConfiguration>,
		database: EventContext['database'],
	) {
		if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
		const source = selectRedirectSource(configuration)
		if (source === null) return
		// Redirect history is meaningful only when both sides of the canonical transition are valid.
		const oldCanonical = canonicalUrlForItem(source, existingItem)
		const newCanonical = canonicalUrlForItem(source, nextItem)
		if (oldCanonical === null || newCanonical === null || oldCanonical === newCanonical) return

		const store = await createRedirectStore(
			context,
			options.SLUGGERNAUT_REDIRECTS_COLLECTION,
			database,
		)
		const existingRedirects = await readRelevantRedirects(store, oldCanonical, newCanonical)
		const plan = planCanonicalRedirect({
			oldCanonical,
			newCanonical,
			source,
			sourceCollection: collection,
			sourceItem: String(key),
			existingRedirects,
		})
		for (const warning of plan.warnings) {
			context.logger.warn(warning, {
				collection,
				field: source.field,
				code: 'redirect-conflict',
			})
		}
		await applyRedirectPlan(store, plan)
	}

	/**
	 * Deactivates managed redirect history after source-item deletion.
	 * @param collection - Deleted source collection.
	 * @param keys - Deleted item keys.
	 * @param database - Event transaction database handle.
	 * @returns void
	 */
	async function processDeletedItems(
		collection: string,
		keys: readonly (string | number)[],
		database: EventContext['database'],
	) {
		if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
		const store = await createRedirectStore(
			context,
			options.SLUGGERNAUT_REDIRECTS_COLLECTION,
			database,
		)

		for (const key of keys) {
			// Each item owns an independent redirect history; one item can be processed after another.
			const redirects = await readManagedRedirectsForItem(store, collection, String(key))
			await applyRedirectLifecyclePlan(store, {
				deactivate: planLifecycleDeactivation(redirects, 'delete'),
				reactivate: [],
			})
		}
	}

	/**
	 * Applies archive lifecycle changes to one source item.
	 * @param collection - Source collection.
	 * @param key - Source item key.
	 * @param lifecycle - Archive lifecycle transition.
	 * @param database - Event transaction database handle.
	 * @returns void
	 */
	async function processArchiveLifecycle(
		collection: string,
		key: string | number,
		lifecycle: 'archive' | 'unarchive',
		database: EventContext['database'],
	) {
		if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
		const store = await createRedirectStore(
			context,
			options.SLUGGERNAUT_REDIRECTS_COLLECTION,
			database,
		)
		const redirects = await readManagedRedirectsForItem(store, collection, String(key))
		await applyRedirectLifecyclePlan(store, {
			deactivate:
				lifecycle === 'archive' ? planLifecycleDeactivation(redirects, 'archive') : [],
			reactivate: lifecycle === 'unarchive' ? planArchiveReactivation(redirects) : [],
		})
	}

	/**
	 * Validates and processes one item update after its boundary checks succeed.
	 * @param payload - Incoming mutation payload.
	 * @param collection - Source collection.
	 * @param key - Source item key.
	 * @param configuration - Parsed collection configuration.
	 * @param archiveSettings - Optional archive metadata.
	 * @param archiveFieldChanged - Whether the archive field is present in the payload.
	 * @param hasRelevantFields - Whether derived fields are present in the payload.
	 * @param eventContext - Directus event context.
	 * @returns The original payload or the coordinated mutation payload.
	 */
	async function processItemUpdate(
		payload: Record<string, unknown>,
		collection: string,
		key: string | number,
		configuration: ReturnType<typeof discoverCollectionConfiguration>,
		archiveSettings: ArchiveSettings | null,
		archiveFieldChanged: boolean,
		hasRelevantFields: boolean,
		eventContext: EventContext,
	): Promise<Record<string, unknown>> {
		const existingItem = await readExistingItem(
			collection,
			key,
			[
				...relevantFields(configuration),
				...(archiveSettings === null ? [] : [archiveSettings.field]),
			],
			eventContext.database,
			eventContext.accountability,
		)

		if (archiveSettings !== null && archiveFieldChanged) {
			const lifecycle = archiveLifecycle(
				existingItem[archiveSettings.field],
				payload[archiveSettings.field],
				archiveSettings,
			)
			if (lifecycle !== null) {
				await processArchiveLifecycle(collection, key, lifecycle, eventContext.database)
			}
		}
		if (!hasRelevantFields) return payload

		// Merge derived values with the previous item before planning redirects so the planner sees the
		// canonical URL that will actually be stored.
		const result = coordinateMutation({
			kind: 'update',
			payload,
			existingItem,
			configuration,
		})
		await processRedirects(
			collection,
			key,
			existingItem,
			{ ...existingItem, ...result.payload },
			configuration,
			eventContext.database,
		)

		return result.payload
	}

	/**
	 * Resolves the only supported item key for an update mutation.
	 * @param value - Directus mutation keys.
	 * @returns A scalar item key.
	 */
	function singleItemKey(value: unknown): string | number {
		if (!isArray(value)) {
			throw new Error('Sluggernaut requires a scalar item key for updates.')
		}
		const keys = value
		if (keys.length > 1) {
			throw new Error(
				'Sluggernaut cannot derive or archive items in an ambiguous bulk mutation.',
			)
		}
		const key = keys[0]
		if (typeof key !== 'string' && typeof key !== 'number') {
			throw new Error('Sluggernaut requires a scalar item key for updates.')
		}
		return key
	}

	hook.filter('items.create', async (payload, meta) => {
		if (!isRecord(payload) && !isArray(payload)) return payload
		const collection = meta.collection
		if (!isString(collection)) throw new Error('Sluggernaut requires a collection key.')

		const configuration = await discoverConfiguration(collection)
		logConfigurationWarnings(collection, configuration)
		if (configuration.slugs.length === 0 && configuration.permalinks.length === 0)
			return payload

		// Bulk creates use the same pure coordinator once per item; no existing item state is needed.
		if (isArray(payload))
			return payload.map((item) => coordinateCreatedItem(item, configuration))

		return coordinateMutation({
			kind: 'create',
			payload,
			existingItem: {},
			configuration,
		}).payload
	})

	hook.filter('items.update', async (payload, meta, eventContext) => {
		if (!isRecord(payload)) return payload
		const collection = meta.collection
		if (!isString(collection)) throw new Error('Sluggernaut requires a collection key.')

		const configuration = await discoverConfiguration(collection)
		const archiveSettings = await discoverArchiveSettings(collection)
		const archiveFieldChanged =
			archiveSettings !== null && hasKey(payload, archiveSettings.field)
		const hasRelevantFields = hasRelevantPayloadField(payload, configuration)
		if (
			configuration.slugs.length === 0 &&
			configuration.permalinks.length === 0 &&
			!archiveFieldChanged
		)
			return payload
		if (!hasRelevantFields && !archiveFieldChanged) return payload
		return processItemUpdate(
			payload,
			collection,
			singleItemKey(meta.keys),
			configuration,
			archiveSettings,
			archiveFieldChanged,
			hasRelevantFields,
			eventContext,
		)
	})

	hook.action('items.delete', (meta, eventContext) => {
		const deleteMeta = isRecord(meta) ? meta : {}
		const collection = deleteMeta.collection
		if (!isString(collection)) return
		const keys = (isArray(deleteMeta.keys) ? deleteMeta.keys : []).filter(
			(key): key is string | number => isString(key) || isNumber(key),
		)
		if (keys.length === 0) return

		void processDeletedItems(collection, keys, eventContext.database).catch(
			(error: unknown) => {
				context.logger.error('Sluggernaut failed to process deleted items.', { error })
			},
		)
	})

	hook.action('items.update', (meta, eventContext) => {
		if (meta.collection !== options.SLUGGERNAUT_REDIRECTS_COLLECTION) return
		if (!isRecord(meta.payload) || !hasKey(meta.payload, 'is_active')) return
		if (hasKey(meta.payload, 'inactive_reason')) return

		const keys = (isArray(meta.keys) ? meta.keys : []).filter(
			(key): key is string | number => isString(key) || isNumber(key),
		)
		if (keys.length === 0) return

		// Directus may toggle is_active without an inactive_reason; restore the neutral reason in that
		// case so manually reactivated redirects are not mistaken for archived/deleted history.
		void eventContext
			.database(options.SLUGGERNAUT_REDIRECTS_COLLECTION)
			.whereIn('id', keys)
			.update({ inactive_reason: null })
			.catch((error: unknown) => {
				context.logger.error('Sluggernaut failed to reactivate redirects.', { error })
			})
	})
}
