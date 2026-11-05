import type { SeedItem } from './seedItem'

import { z } from 'zod'

const collectionManagementSchema = z
	.strictObject({ type: z.literal('id-range'), min: z.int().optional(), max: z.int().optional() })
	.refine((range) => range.min !== undefined || range.max !== undefined, {
		error: 'Provide at least one ID bound',
	})
	.refine(
		(range) => range.min === undefined || range.max === undefined || range.min < range.max,
		{ error: 'min must be less than max' },
	)

/** Numeric IDs managed by full-idempotent, with an inclusive min and exclusive max. */
export type CollectionManagement = z.infer<typeof collectionManagementSchema>

const numericSeedIdSchema = z.looseObject({ id: z.int() })

/**
 * Validates the management boundary and every seed ID before any import mutations.
 * @param collectionName - Collection whose boundary is being checked.
 * @param data - All seed rows for the collection.
 * @param management - Optional internal management boundary.
 * @returns The validated range, or undefined for a fully managed collection.
 * @throws Error when the range or a seed ID is invalid or outside the boundary.
 */
export function validateManagedSeedData(
	collectionName: string,
	data: SeedItem[],
	management: unknown,
): CollectionManagement | undefined {
	if (management === undefined) return undefined

	const parsed = collectionManagementSchema.safeParse(management)
	if (!parsed.success) {
		throw new Error(
			`Invalid management for collection "${collectionName}": ${parsed.error.message}`,
		)
	}

	const { min, max } = parsed.data
	for (const [index, item] of data.entries()) {
		const record = numericSeedIdSchema.safeParse(item)
		if (!record.success) {
			throw new Error(
				`Seed record ${index + 1} for collection "${collectionName}" requires a safe integer numeric ID for id-range management`,
			)
		}
		const { id } = record.data
		if ((min !== undefined && id < min) || (max !== undefined && id >= max)) {
			throw new Error(
				`Seed record ${index + 1} for collection "${collectionName}" has ID ${id} outside managed ID range [${min ?? '-infinity'}, ${max ?? 'infinity'})`,
			)
		}
	}

	return parsed.data
}
