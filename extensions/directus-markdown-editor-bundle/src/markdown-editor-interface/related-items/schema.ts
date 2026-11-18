import { z } from 'zod'

import { ReferencePropsSchema } from '../reference/schema'

/** Source identity and configured data embedded in each related item. */
export const RelatedItemSchema = ReferencePropsSchema.pick({
	collection: true,
	item: true,
	label: true,
	data: true,
})

export type RelatedItem = z.infer<typeof RelatedItemSchema>

/**
 * Identify a source within a collection, independent of primary-key representation.
 * @param item Embedded source identity.
 * @returns Stable key for selection and sorting.
 */
export function relatedItemKey(item: Pick<RelatedItem, 'collection' | 'item'>): string {
	return JSON.stringify([item.collection, String(item.item)])
}

/** Ordered snapshots stored in the RelatedItemList block's YAML properties. */
export const RelatedItemListPropsSchema = z.looseObject({
	items: z
		.array(RelatedItemSchema)
		.refine(
			(items) => new Set(items.map(relatedItemKey)).size === items.length,
			'A related item may only occur once in a list.',
		),
})
