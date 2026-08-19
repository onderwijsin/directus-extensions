import { z } from 'zod'

import { redisConfigSchema } from './redis'

/** Directus synchronization backends used as the global extension fallback. */
export const synchronizationStoreSchema = z.enum(['memory', 'redis'])

/** Directus synchronization and Redis environment values. */
export const synchronizationConfigSchema = z
	.object({
		SYNCHRONIZATION_STORE: synchronizationStoreSchema.default('memory'),
	})
	.extend(redisConfigSchema.shape)

export type SynchronizationConfig = z.output<typeof synchronizationConfigSchema>
export type SynchronizationStore = z.output<typeof synchronizationStoreSchema>
