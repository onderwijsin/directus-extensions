import type { AbstractService } from '@directus/types'
import type { RecalculationOutcome } from './item'

import { isArray } from '@onderwijsin/directus-extension-utils'

const PAGE_SIZE = 100

interface RecalculatePagesInput {
	itemsService: AbstractService
	fields: string[]
	primaryKey: string
	processItem: (item: unknown) => Promise<RecalculationOutcome>
}

/** Aggregate outcome counts returned by the recalculation operation. */
export interface RecalculateResult {
	processed: number
	updated: number
	skipped: number
	failed: number
}

/**
 * Processes a collection in bounded, primary-key-ordered pages.
 * @param input - Page-reading and item-processing dependencies.
 * @returns Aggregate recalculation statistics.
 */
export async function recalculatePages(input: RecalculatePagesInput): Promise<RecalculateResult> {
	const result: RecalculateResult = { processed: 0, updated: 0, skipped: 0, failed: 0 }

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const items = await input.itemsService.readByQuery({
			fields: input.fields,
			limit: PAGE_SIZE,
			offset,
			sort: [input.primaryKey],
		})
		if (!isArray(items) || items.length === 0) break

		for (const item of items) {
			result.processed += 1
			const outcome = await input.processItem(item)
			result[outcome] += 1
		}

		// A short page is terminal; a full page may have more items.
		if (items.length < PAGE_SIZE) break
	}

	return result
}
