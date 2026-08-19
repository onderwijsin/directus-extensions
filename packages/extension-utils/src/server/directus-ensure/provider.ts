import type { LockProvider } from '../lock'
import type { DirectusStartupOptions } from './config'

import { createFsLockProvider, createMemoryLockProvider, createRedisLockProvider } from '../lock'

const DEFAULT_STARTUP_MEMORY_PROVIDER_ID = 'directus-startup'

/** A lock provider together with cleanup for resources created by the factory. */
export interface DirectusStartupLockProvider {
	provider: LockProvider
	dispose: () => Promise<void>
}

/**
 * Creates the configured Directus startup lock provider.
 * @param options - Validated shared startup environment options.
 * @returns The provider and its owned-resource cleanup function.
 */
export function createStartupLockProvider(
	options: DirectusStartupOptions,
): DirectusStartupLockProvider {
	switch (options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER) {
		case 'REDIS': {
			const redisUrl = options.DIRECTUS_EXTENSIONS_LOCK_REDIS_URL ?? options.REDIS
			if (!redisUrl) {
				throw new Error(
					'Redis lock provider requires DIRECTUS_EXTENSIONS_LOCK_REDIS_URL or REDIS',
				)
			}
			const provider = createRedisLockProvider({
				redisUrl,
			})
			return {
				provider,
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
					providerId: options.DIRECTUS_EXTENSION_ID ?? DEFAULT_STARTUP_MEMORY_PROVIDER_ID,
				}),
				/**
				 * Releases no external resources for the memory provider.
				 * @returns A resolved promise.
				 */
				dispose: () => Promise.resolve(),
			}
	}
}
