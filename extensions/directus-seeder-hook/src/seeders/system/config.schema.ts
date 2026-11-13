import type { CollectionManagement } from '../../lib/collectionManagement'

import { z } from 'zod'

import { collectionManagementSchema } from '../../lib/collectionManagement'
import { collectionOverridesSchema, collectionSchema } from '../config.schema'
import { SYSTEM_COLLECTIONS } from './config'

// Preserve the existing system source allowlist independently of application collections.
const systemManagementSchema: z.ZodType<CollectionManagement> = z.discriminatedUnion('type', [
	collectionManagementSchema.options[0],
	collectionManagementSchema.options[1].extend({
		collection: z.enum(
			SYSTEM_COLLECTIONS.map(({ collection }) => collection).filter(
				(name) => name !== 'directus_extensions',
			),
		),
	}),
	collectionManagementSchema.options[2],
])

/** System overrides retain the supported relation-source allowlist. */
export const systemCollectionOverridesSchema = z.strictObject({
	...collectionOverridesSchema.shape,
	management: systemManagementSchema.nullish(),
})

/** Effective built-in or consumer-overridden system collection. */
export const systemCollectionSchema = z.strictObject({
	...collectionSchema.shape,
	management: systemManagementSchema.optional(),
})
