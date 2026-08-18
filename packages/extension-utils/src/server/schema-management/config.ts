import { z } from 'zod'

import { extensionsEnvSchema, schemaLockProviderSchema } from '../schema'

export { schemaLockProviderSchema }

/**
 * Validates global schema change configuration.
 *
 * @returns Validated schema for global schema change permissions.
 */
export const schemaChangeSchema = extensionsEnvSchema.safeExtend({
	DIRECTUS_EXTENSION_ID: z.string().optional(),
})

export type SchemaChangeOptions = z.output<typeof schemaChangeSchema>

/** Shared lock namespace for extension schema operations. */
export const DIRECTUS_EXTENSION_SCHEMA_LOCK = 'directus-extension-schema'

/**
 * Builds the lock name for one extension's schema operation.
 * @param name - Extension identifier.
 * @returns The namespaced schema lock name.
 */
export function getSchemaLockName(name: string): string {
	return DIRECTUS_EXTENSION_SCHEMA_LOCK + ':' + name
}
