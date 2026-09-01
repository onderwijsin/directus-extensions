import { z } from 'zod'

import { defineExtensionOptionsShape, type ExtensionOptionsShapeBuilder } from '../schema-builder'
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

/**
 * Defines extension options that include the shared synchronization configuration.
 *
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export const defineSynchronizationConfigSchema = <const Shape extends z.ZodRawShape>(
	builder: ExtensionOptionsShapeBuilder<Shape>,
) => defineExtensionOptionsShape(synchronizationConfigSchema, builder)
