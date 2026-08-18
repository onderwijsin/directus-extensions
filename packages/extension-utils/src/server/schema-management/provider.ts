import type { LockProvider } from '../lock'
import type { SchemaChangeOptions } from './config'

import { createFsLockProvider, createMemoryLockProvider, createRedisLockProvider } from '../lock'

const DEFAULT_SCHEMA_CHANGE_MEMORY_PROVIDER_ID = 'schema-change'

/** A lock provider together with cleanup for resources created by the factory. */
export interface SchemaChangeLockProvider {
	provider: LockProvider
	dispose: () => Promise<void>
}

/**
 * Creates the configured schema-change lock provider.
 * @param options - Validated global schema-change environment options.
 * @returns The provider and its owned-resource cleanup function.
 */
export function createSchemaChangeLockProvider(
	options: SchemaChangeOptions,
): SchemaChangeLockProvider {
	switch (options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER) {
		case 'REDIS': {
			if (!options.DIRECTUS_EXTENSIONS_LOCK_REDIS_URL) {
				throw new Error('Redis lock provider requires DIRECTUS_EXTENSIONS_LOCK_REDIS_URL')
			}
			const provider = createRedisLockProvider({
				redisUrl: options.DIRECTUS_EXTENSIONS_LOCK_REDIS_URL,
			})
			return {
				provider /**
				 *
				 */,
				/**
				 * Releases no external resources for the filesystem provider.
				 * @returns A resolved promise.
				 */
				dispose: () => provider.dispose(),
			}
		}
		case 'FS':
			if (!options.DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY) {
				throw new Error(
					'Filesystem lock provider requires DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY',
				)
			}
			return {
				provider: createFsLockProvider({
					directory: options.DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY,
				}),
				/**
				 * Releases no external resources for the filesystem provider.
				 * @returns A resolved promise.
				 */
				dispose: () => Promise.resolve(),
			}
		case 'MEMORY':
		default:
			return {
				provider: createMemoryLockProvider({
					providerId:
						options.DIRECTUS_EXTENSION_ID ?? DEFAULT_SCHEMA_CHANGE_MEMORY_PROVIDER_ID,
				}),
				/**
				 * Releases no external resources for the memory provider.
				 * @returns A resolved promise.
				 */
				dispose: () => Promise.resolve(),
			}
	}
}
