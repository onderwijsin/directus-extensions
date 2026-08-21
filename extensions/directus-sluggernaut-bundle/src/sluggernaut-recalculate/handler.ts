/**
 * @fileoverview Executes bounded collection-wide derived-field recalculation.
 *
 * Implements the Sluggernaut recalculation operation.
 *
 * Items are read in bounded pages and each item is coordinated through the same mutation logic as
 * normal writes. Redirect creation is optional: when disabled, updates bypass item hooks and write
 * through the current database transaction to avoid recursively processing the operation.
 */
import type { OperationContext } from '@directus/types'
import type { SluggernautEnv } from '../sluggernaut-hook/configuration/env.schema'
import type { RecalculateOptions } from './options.schema'

import {
	attempt,
	fromEntries,
	isArray,
	isRecord,
	keys,
	toEntries,
} from '@onderwijsin/directus-extension-utils'

import { createFieldReader } from '../server/field-reader'
import { discoverCollectionConfiguration } from '../shared/configuration/discovery'
import { coordinateMutation } from '../sluggernaut-hook/mutation/coordinator'

/** Aggregate outcome counts returned by the recalculation operation. */
export interface RecalculateResult {
	processed: number
	updated: number
	skipped: number
	failed: number
}

const PAGE_SIZE = 100

type RecalculationConfiguration = ReturnType<typeof discoverCollectionConfiguration>
type RecalculationOutcome = 'updated' | 'skipped' | 'failed'

interface RecalculationItemsService {
	updateOne(itemKey: string | number, updates: Record<string, unknown>): Promise<unknown>
}

/**
 * Resolves the strict recalculation allowlist.
 * @param options - Operation input.
 * @param configuration - Discovered collection configuration.
 * @returns Selected derived field keys.
 */
function selectedFieldKeys(
	options: RecalculateOptions,
	configuration: ReturnType<typeof discoverCollectionConfiguration>,
): ReadonlySet<string> {
	const derivedFields = [
		...configuration.slugs.map((field) => field.field),
		...configuration.permalinks
			.filter((field) => field.options.generateFromSlug)
			.map((field) => field.field),
	]
	if (options.fieldKeys === undefined) return new Set(derivedFields)

	const requested = new Set(options.fieldKeys)
	return new Set(derivedFields.filter((field) => requested.has(field)))
}

/**
 * Finds the collection primary key from Directus field metadata.
 * @param fields - Directus field service results.
 * @returns Primary key field name, or `id` when metadata is incomplete.
 */
function primaryKeyFromFields(
	fields: readonly { field: string; schema?: { is_primary_key?: boolean } | null }[],
): string {
	return fields.find((field) => field.schema?.is_primary_key === true)?.field ?? 'id'
}

/**
 * Recalculates one item and records failures without aborting the operation.
 * @param item - Item read from Directus.
 * @param primaryKey - Collection primary key field.
 * @param collection - Collection key.
 * @param configuration - Discovered Sluggernaut configuration.
 * @param fieldKeys - Fields selected for recalculation.
 * @param itemsService - Directus item service.
 * @param database - Directus database handle.
 * @param logger - Directus logger.
 * @param createRedirects - Whether updates should pass through item hooks.
 * @param redirectsEnabled - Whether redirect handling is enabled globally.
 * @returns The outcome for the item.
 */
async function recalculateItem(
	item: unknown,
	primaryKey: string,
	collection: string,
	configuration: RecalculationConfiguration,
	fieldKeys: ReadonlySet<string>,
	itemsService: RecalculationItemsService,
	database: OperationContext['database'],
	logger: OperationContext['logger'],
	createRedirects: boolean,
	redirectsEnabled: boolean,
): Promise<RecalculationOutcome> {
	if (!isRecord(item)) {
		logger.warn('Sluggernaut skipped an item without a scalar id.', {
			collection,
			code: 'recalculate-invalid-item',
		})
		return 'failed'
	}

	const itemKey = item[primaryKey]
	if (typeof itemKey !== 'string' && typeof itemKey !== 'number') {
		logger.warn('Sluggernaut skipped an item without a scalar id.', {
			collection,
			code: 'recalculate-invalid-item',
		})
		return 'failed'
	}

	const itemResult = await attempt(async () => {
		const mutation = coordinateMutation({
			kind: 'recalculate',
			payload: {},
			existingItem: item,
			configuration,
			fieldKeys,
		})
		const updates = fromEntries(
			toEntries(mutation.payload).filter(([field]) => fieldKeys.has(field)),
		)
		if (keys(updates).length === 0) return 'skipped' as const

		if (createRedirects && redirectsEnabled) {
			await itemsService.updateOne(itemKey, updates)
			return 'updated' as const
		}

		await database(collection).where(primaryKey, itemKey).update(updates)
		return 'updated' as const
	})
	if (itemResult.error === null && itemResult.data !== null) return itemResult.data

	logger.warn('Sluggernaut failed to recalculate an item.', {
		collection,
		item: String(itemKey),
		error:
			itemResult.error instanceof Error
				? itemResult.error.message
				: (JSON.stringify(itemResult.error) ?? 'Unknown error'),
		code: 'recalculate-item-failed',
	})
	return 'failed'
}

/**
 * Recalculates configured derived fields in bounded pages.
 * @param options - Operation input.
 * @param context - Directus operation context.
 * @param envOptions - Validated extension options.
 * @returns Bounded recalculation statistics.
 */
export async function recalculateFields(
	options: RecalculateOptions,
	context: OperationContext,
	envOptions: SluggernautEnv,
): Promise<RecalculateResult> {
	const { collection, createRedirects } = options
	const fieldReader = createFieldReader(context)
	const fields = await fieldReader.read(collection)
	const schema = await context.getSchema()
	const configuration = discoverCollectionConfiguration(fields)
	const primaryKey = primaryKeyFromFields(fields)
	const fieldKeys = selectedFieldKeys(options, configuration)
	const result: RecalculateResult = { processed: 0, updated: 0, skipped: 0, failed: 0 }
	if (fieldKeys.size === 0) return result

	const itemFields = new Set<string>([primaryKey])
	for (const field of configuration.slugs) {
		for (const sourceField of field.options.sourceFields) itemFields.add(sourceField)
		itemFields.add(field.field)
	}
	for (const field of configuration.permalinks) {
		itemFields.add(field.field)
		if (field.options.slugField) itemFields.add(field.options.slugField)
	}

	const itemsService = new context.services.ItemsService(collection, {
		schema,
		accountability: null,
		knex: context.database,
	})

	for (let offset = 0; ; offset += PAGE_SIZE) {
		// Stable ordering plus bounded pages keeps memory use predictable during bulk repair.
		const items = await itemsService.readByQuery({
			fields: [...itemFields],
			limit: PAGE_SIZE,
			offset,
			sort: [primaryKey],
		})
		if (!isArray(items) || items.length === 0) break

		for (const item of items) {
			result.processed += 1
			const outcome = await recalculateItem(
				item,
				primaryKey,
				collection,
				configuration,
				fieldKeys,
				itemsService,
				context.database,
				context.logger,
				createRedirects,
				envOptions.SLUGGERNAUT_REDIRECTS_ENABLED,
			)
			result[outcome] += 1
		}

		// A short page is the terminal page; otherwise continue with the next offset.
		if (items.length < PAGE_SIZE) break
	}

	return result
}
