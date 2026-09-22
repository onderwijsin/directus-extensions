import { z } from 'zod'

import {
	createExtensionOptionsConfigFragment,
	defineExtensionOptionsShape,
	type ExtensionOptionsShapeBuilder,
} from '../schema-builder'
import { redisConfig, redisConfigSchema } from './redis'

/**
 * Creates the synchronization store schema with the supplied runtime.
 * @param zod - Package-owned Zod runtime.
 * @returns A synchronization store schema.
 */
const createSynchronizationStoreSchema = (zod: typeof z) => zod.enum(['memory', 'redis'])

/**
 * Builds synchronization fields for raw schemas and fragments.
 * @param zod - Package-owned Zod runtime.
 * @returns The synchronization configuration shape.
 */
const defineSynchronizationConfigShape = (zod: typeof z) => ({
	SYNCHRONIZATION_STORE: createSynchronizationStoreSchema(zod).default('memory'),
})

/** Directus synchronization backends used as the global extension fallback. */
export const synchronizationStoreSchema = createSynchronizationStoreSchema(z)

/** Directus synchronization and Redis environment values. */
export const synchronizationConfigSchema = z
	.object(defineSynchronizationConfigShape(z))
	.extend(redisConfigSchema.shape)

export type SynchronizationConfig = z.output<typeof synchronizationConfigSchema>
export type SynchronizationStore = z.output<typeof synchronizationStoreSchema>

/** Shared synchronization and Redis configuration for declarative options composition. */
export const synchronizationConfig = createExtensionOptionsConfigFragment<SynchronizationConfig>({
	dependencies: [redisConfig],
	name: 'synchronizationConfig',
	shape: defineSynchronizationConfigShape,
})

/**
 * Defines extension options that include the shared synchronization configuration.
 *
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export const defineSynchronizationConfigSchema = <const Shape extends z.ZodRawShape>(
	builder: ExtensionOptionsShapeBuilder<Shape>,
) => defineExtensionOptionsShape(synchronizationConfig, builder)
