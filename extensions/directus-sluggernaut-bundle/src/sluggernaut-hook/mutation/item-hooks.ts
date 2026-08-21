/**
 * @fileoverview Registers Sluggernaut's four item mutation hooks.
 *
 * Hook callbacks keep only Directus boundary validation and orchestration. Mutation, archive, and
 * redirect behavior lives in domain-focused utilities so each path can be tested independently.
 */
import type { HookExtensionContext } from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
import type { FieldReader } from '../../server/field-reader'
import type { SluggernautEnv } from '../configuration/env.schema'

import {
	attempt,
	hasKey,
	isArray,
	isNumber,
	isRecord,
	isString,
} from '@onderwijsin/directus-extension-utils'

import { discoverArchiveSettings } from './archive'
import { coordinateMutation } from './coordinator'
import { getConfiguration, logConfigurationWarnings } from './helpers'
import { hasRelevantPayloadField, singleItemKey } from './items'
import { processDeletedItems } from './redirects'
import { processItemUpdate } from './update'

/**
 * Registers item mutation and redirect hooks.
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @param options - Validated extension options.
 * @param fieldReader - Field metadata reader.
 * @returns Nothing.
 */
export function registerSluggernautItemHooks(
	hook: RegisterFunctions,
	context: HookExtensionContext,
	options: SluggernautEnv,
	fieldReader: FieldReader,
): void {
	/**
	 * Applies configured derived values to an item creation payload.
	 * @param payload - Incoming item or bulk item payload.
	 * @param meta - Directus mutation metadata.
	 * @returns The payload with derived values applied.
	 */
	hook.filter('items.create', async (payload, meta) => {
		if (!isRecord(payload)) return payload
		const collection = meta.collection
		if (!isString(collection)) throw new Error('Sluggernaut requires a collection key.')

		const configuration = await getConfiguration(collection, fieldReader)
		logConfigurationWarnings(collection, configuration, context)
		if (configuration.slugs.length === 0 && configuration.permalinks.length === 0)
			return payload

		return coordinateMutation({
			kind: 'create',
			payload,
			existingItem: {},
			configuration,
		}).payload
	})

	/**
	 * Applies configured derived values and archive transitions to an item update payload.
	 * @param payload - Incoming item update payload.
	 * @param meta - Directus mutation metadata.
	 * @param eventContext - Directus event context.
	 * @returns The payload with derived values applied.
	 */
	hook.filter('items.update', async (payload, meta, eventContext) => {
		if (!isRecord(payload)) return payload
		const collection = meta.collection
		if (!isString(collection)) throw new Error('Sluggernaut requires a collection key.')

		const configuration = await getConfiguration(collection, fieldReader)
		logConfigurationWarnings(collection, configuration, context)
		const archiveSettings = options.SLUGGERNAUT_REDIRECTS_ENABLED
			? await discoverArchiveSettings(context, collection)
			: null
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

		return processItemUpdate({
			context,
			options,
			payload,
			collection,
			key: singleItemKey(meta.keys),
			configuration,
			archiveSettings,
			archiveFieldChanged,
			hasRelevantFields,
			eventContext,
		})
	})

	/**
	 * Deactivates managed redirect history after item deletion.
	 * @param meta - Directus deletion metadata.
	 * @param eventContext - Directus event context.
	 * @returns void.
	 */
	hook.action('items.delete', async (meta, eventContext) => {
		const deleteMeta = isRecord(meta) ? meta : {}
		const collection = deleteMeta.collection
		if (!isString(collection)) return
		const keys = (isArray(deleteMeta.keys) ? deleteMeta.keys : []).filter(
			(key): key is string | number => isString(key) || isNumber(key),
		)
		if (keys.length === 0) return

		const { error } = await attempt(() =>
			processDeletedItems({
				context,
				options,
				collection,
				keys,
				database: eventContext.database,
			}),
		)
		if (error) context.logger.error('Sluggernaut failed to process deleted items.', { error })
	})

	/**
	 * Restores neutral inactive reasons after manual redirect reactivation.
	 * @param meta - Directus redirect update metadata.
	 * @param eventContext - Directus event context.
	 * @returns void.
	 */
	hook.action('items.update', async (meta, eventContext) => {
		if (meta.collection !== options.SLUGGERNAUT_REDIRECTS_COLLECTION) return
		if (!isRecord(meta.payload) || !hasKey(meta.payload, 'is_active')) return
		if (hasKey(meta.payload, 'inactive_reason')) return

		const keys = (isArray(meta.keys) ? meta.keys : []).filter(
			(key): key is string | number => isString(key) || isNumber(key),
		)
		if (keys.length === 0) return

		const { error } = await attempt(() =>
			eventContext
				.database(options.SLUGGERNAUT_REDIRECTS_COLLECTION)
				.whereIn('id', keys)
				.update({ inactive_reason: null }),
		)
		if (error) context.logger.error('Sluggernaut failed to reactivate redirects.', { error })
	})
}
