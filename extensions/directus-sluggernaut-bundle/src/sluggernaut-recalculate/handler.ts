/** @fileoverview Orchestrates collection-wide Sluggernaut recalculation. */
import type { OperationContext } from '@directus/types'
import type { SluggernautEnv } from '../sluggernaut-hook/configuration/env.schema'
import type { RecalculateOptions } from './options.schema'

import { createFieldReader } from '../server/field-reader'
import { discoverCollectionConfiguration } from '../shared/configuration/discovery'
import { recalculateItem } from './item'
import { recalculatePages, type RecalculateResult } from './pages'
import { primaryKeyFromFields, requiredItemFields, selectFieldKeys } from './selection'

export type { RecalculateResult } from './pages'

/**
 * Creates the system-accountability item service used by the bulk operation.
 * @param collection - Collection to recalculate.
 * @param context - Directus operation context.
 * @returns Configured item service.
 */
async function createItemsService(collection: string, context: OperationContext) {
	const schema = await context.getSchema()
	return new context.services.ItemsService(collection, {
		schema,
		accountability: null,
		knex: context.database,
	})
}

/**
 * Recalculates configured derived fields in bounded pages.
 * @param options - Validated operation input.
 * @param context - Directus operation context.
 * @param envOptions - Validated extension options.
 * @returns Bounded recalculation statistics.
 */
export async function recalculateFields(
	options: RecalculateOptions,
	context: OperationContext,
	envOptions: SluggernautEnv,
): Promise<RecalculateResult> {
	const fieldReader = createFieldReader(context)
	const fields = await fieldReader.read(options.collection)
	const configuration = discoverCollectionConfiguration(fields)
	const fieldKeys = selectFieldKeys(options, configuration)
	if (fieldKeys.size === 0) return { processed: 0, updated: 0, skipped: 0, failed: 0 }

	const primaryKey = primaryKeyFromFields(fields)
	const itemsService = await createItemsService(options.collection, context)
	/**
	 * Recalculates one item with the collection-scoped dependencies.
	 * @param item - Item returned by the page reader.
	 * @returns The item's recalculation outcome.
	 */
	const processItem = (item: unknown) =>
		recalculateItem({
			item,
			primaryKey,
			collection: options.collection,
			configuration,
			fieldKeys,
			itemsService,
			database: context.database,
			logger: context.logger,
			createRedirects: options.createRedirects,
			redirectsEnabled: envOptions.SLUGGERNAUT_REDIRECTS_ENABLED,
		})

	return recalculatePages({
		itemsService,
		fields: requiredItemFields(primaryKey, configuration),
		primaryKey,
		processItem,
	})
}
