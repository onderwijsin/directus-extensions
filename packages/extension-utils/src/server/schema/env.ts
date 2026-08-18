import { z } from 'zod'

/** Supported providers for global schema-change coordination. */
export const schemaLockProviderSchema = z.enum(['MEMORY', 'REDIS', 'FS'])

/** Supported backing stores for extension rate limiters. */
export const rateLimiterStoreSchema = z.enum(['memory', 'redis'])

/**
 * Validates environment configuration shared by Onderwijs in Directus extensions.
 *
 * @returns Validated schema for global extension environment settings.
 */
export const extensionsEnvSchema = z
	.object({
		DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
		DIRECTUS_EXTENSIONS_LOCK_PROVIDER: schemaLockProviderSchema.default('MEMORY'),
		DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: z.string().trim().min(1).optional(),
		DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: z.string().trim().min(1).optional(),
		EXTENSIONS_RATE_LIMITER_STORE: rateLimiterStoreSchema.default('memory'),
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

export type ExtensionsEnv = z.output<typeof extensionsEnvSchema>
