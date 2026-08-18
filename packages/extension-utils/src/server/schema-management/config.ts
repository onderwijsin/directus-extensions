import { z } from 'zod'

/** Supported providers for global schema-change coordination. */
export const schemaLockProviderSchema = z.enum(['MEMORY', 'REDIS', 'FS'])

/**
 * Validates global schema change configuration.
 *
 * @returns Validated schema for global schema change permissions.
 */
export const schemaChangeSchema = z
	.object({
		DIRECTUS_EXTENSION_ID: z.string().optional(),
		DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
		DIRECTUS_EXTENSIONS_LOCK_PROVIDER: schemaLockProviderSchema.default('MEMORY'),
		DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: z.string().trim().min(1).optional(),
		DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: z.string().trim().min(1).optional(),
	})
	.superRefine((options, context) => {
		if (
			options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER === 'REDIS' &&
			!options.DIRECTUS_EXTENSIONS_LOCK_REDIS_URL
		) {
			context.addIssue({
				code: 'custom',
				path: ['DIRECTUS_EXTENSIONS_LOCK_REDIS_URL'],
				message: 'is required when DIRECTUS_EXTENSIONS_LOCK_PROVIDER is REDIS',
			})
		}
		if (
			options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER === 'FS' &&
			!options.DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY
		) {
			context.addIssue({
				code: 'custom',
				path: ['DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY'],
				message: 'is required when DIRECTUS_EXTENSIONS_LOCK_PROVIDER is FS',
			})
		}
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
