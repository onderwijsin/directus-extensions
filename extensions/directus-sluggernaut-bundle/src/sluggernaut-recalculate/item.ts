import type { OperationContext } from '@directus/types'
import type { RecalculationConfiguration } from './selection'

import {
	attempt,
	fromEntries,
	isRecord,
	keys,
	toEntries,
} from '@onderwijsin/directus-extension-utils'

import { coordinateMutation } from '../sluggernaut-hook/mutation/coordinator'

export type RecalculationOutcome = 'updated' | 'skipped' | 'failed'

interface RecalculationItemsService {
	updateOne(itemKey: string | number, updates: Record<string, unknown>): Promise<unknown>
}

interface RecalculateItemInput {
	item: unknown
	primaryKey: string
	collection: string
	configuration: RecalculationConfiguration
	fieldKeys: ReadonlySet<string>
	itemsService: RecalculationItemsService
	database: OperationContext['database']
	logger: OperationContext['logger']
	createRedirects: boolean
	redirectsEnabled: boolean
}

/**
 * Resolves a scalar primary key from an item returned by Directus.
 * @param item - Item returned by the item service.
 * @param primaryKey - Collection primary key field.
 * @param collection - Collection key used for diagnostics.
 * @param logger - Directus logger.
 * @returns Scalar item key, or null when the item cannot be processed.
 */
function itemKeyFromValue(
	item: unknown,
	primaryKey: string,
	collection: string,
	logger: OperationContext['logger'],
): string | number | null {
	if (!isRecord(item)) {
		logger.warn('Sluggernaut skipped an item without a scalar id.', {
			collection,
			code: 'recalculate-invalid-item',
		})
		return null
	}

	const itemKey = item[primaryKey]
	if (typeof itemKey === 'string' || typeof itemKey === 'number') return itemKey

	logger.warn('Sluggernaut skipped an item without a scalar id.', {
		collection,
		code: 'recalculate-invalid-item',
	})
	return null
}

/**
 * Derives the selected values for one item without performing persistence.
 * @param item - Existing item values.
 * @param configuration - Discovered collection configuration.
 * @param fieldKeys - Selected derived field keys.
 * @returns Values that should be persisted.
 */
function recalculationUpdates(
	item: Record<string, unknown>,
	configuration: RecalculationConfiguration,
	fieldKeys: ReadonlySet<string>,
): Record<string, unknown> {
	const mutation = coordinateMutation({
		kind: 'recalculate',
		payload: {},
		existingItem: item,
		configuration,
		fieldKeys,
	})
	return fromEntries(toEntries(mutation.payload).filter(([field]) => fieldKeys.has(field)))
}

/**
 * Persists one recalculation using the configured redirect strategy.
 * @param input - Item and persistence dependencies.
 * @param itemKey - Primary key of the item being updated.
 * @param updates - Derived values to persist.
 * @returns Resolves when persistence succeeds.
 */
async function persistRecalculation(
	input: RecalculateItemInput,
	itemKey: string | number,
	updates: Record<string, unknown>,
): Promise<void> {
	if (input.createRedirects && input.redirectsEnabled) {
		await input.itemsService.updateOne(itemKey, updates)
		return
	}

	await input.database(input.collection).where(input.primaryKey, itemKey).update(updates)
}

/**
 * Logs a recoverable item recalculation failure.
 * @param input - Item processing dependencies.
 * @param itemKey - Primary key of the failed item.
 * @param error - Failure captured during derivation or persistence.
 * @returns Nothing.
 */
function logRecalculationFailure(
	input: RecalculateItemInput,
	itemKey: string | number,
	error: unknown,
): void {
	input.logger.warn('Sluggernaut failed to recalculate an item.', {
		collection: input.collection,
		item: String(itemKey),
		error: error instanceof Error ? error.message : (JSON.stringify(error) ?? 'Unknown error'),
		code: 'recalculate-item-failed',
	})
}

/**
 * Recalculates one item and records failures without aborting the operation.
 * @param input - Item and persistence dependencies.
 * @returns The outcome for the item.
 */
export async function recalculateItem(input: RecalculateItemInput): Promise<RecalculationOutcome> {
	const itemKey = itemKeyFromValue(input.item, input.primaryKey, input.collection, input.logger)
	if (itemKey === null || !isRecord(input.item)) return 'failed'
	const item = input.item

	const result = await attempt(async () => {
		const updates = recalculationUpdates(item, input.configuration, input.fieldKeys)
		if (keys(updates).length === 0) return 'skipped' as const
		await persistRecalculation(input, itemKey, updates)
		return 'updated' as const
	})
	if (result.error === null && result.data !== null) return result.data

	logRecalculationFailure(input, itemKey, result.error)
	return 'failed'
}
