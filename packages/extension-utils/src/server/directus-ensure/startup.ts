import type { LockLease, LockProvider } from '../lock'
import type { LoggerLike } from '../logger'

import { attempt } from '../../shared/attempt'
import { getDirectusStartupLockName, type DirectusStartupOptions } from './config'
import { resolveDirectusLockProvider, type BaseEnsureOptions } from './operations/core'

/** Minimal action registration contract used by server extensions. */
export type ActionRegistrar = (event: 'server.start', handler: () => void) => void

/** Options controlling startup coordination registration. */
export interface CreateDirectusStartupCoordinatorOptions {
	id: string
	name: string
	disabled: boolean
	disabledGlobally: boolean
	dataDisabledGlobally?: boolean
	lockProvider?: LockProvider
	lockProviderConfig?: DirectusStartupOptions
	lockLeaseMs?: number
}

/** Context passed to startup callbacks so ensures reuse the held startup lock. */
export interface DirectusStartupContext {
	lockProvider: LockProvider
}

/** Coordinator for ordered schema and data startup callbacks. */
export interface DirectusStartupCoordinator {
	schema(callback: (context: DirectusStartupContext) => Promise<void>): void
	data(callback: (context: DirectusStartupContext) => Promise<void>): void
}

/**
 * @param lockName - Held lock name.
 * @param lease - Held lock lease.
 * @returns A provider bound to the held lease.
 */
const createHeldLockProvider = (lockName: string, lease: LockLease): LockProvider => ({
	/**
	 * @param requestedName - Requested lock name.
	 * @returns The held lease when names match.
	 */
	tryAcquire: (requestedName) => Promise.resolve(requestedName === lockName ? lease : null),
	/**
	 * @param requestedName - Requested lock name.
	 * @returns Whether this is the held lock.
	 */
	isLocked: (requestedName) => Promise.resolve(requestedName === lockName),
})

/**
 * Creates a startup coordinator with one ordered, shared startup lock.
 * @param action - Directus action registrar.
 * @param logger - Logger used for lifecycle and failure messages.
 * @param options - Enablement and lock configuration.
 * @returns A coordinator for registering schema and data callbacks.
 */
export function createDirectusStartupCoordinator(
	action: ActionRegistrar,
	logger: LoggerLike,
	options: CreateDirectusStartupCoordinatorOptions,
): DirectusStartupCoordinator {
	const schemaCallbacks: ((context: DirectusStartupContext) => Promise<void>)[] = []
	const dataCallbacks: ((context: DirectusStartupContext) => Promise<void>)[] = []
	const lockOptions: BaseEnsureOptions = options

	action('server.start', () => {
		void (async () => {
			if (options.disabledGlobally) {
				logger.info(options.name + ' Directus startup is disabled globally')
				return
			}
			if (options.disabled) {
				logger.info(options.name + ' Directus startup is disabled for this extension')
				return
			}
			if (options.dataDisabledGlobally) {
				logger.info(options.name + ' Directus data seeds are disabled globally')
			}

			const providerResult = await attempt(() => resolveDirectusLockProvider(lockOptions))
			if (providerResult.error !== null) {
				logger.error({
					msg: options.name + ' Directus startup failed',
					cause: providerResult.error,
				})
				return
			}
			const configuredProvider = providerResult.data
			if (!configuredProvider) return
			const provider = configuredProvider.provider
			const lockName = getDirectusStartupLockName(options.id)
			let lease: LockLease | null = null
			const startupResult = await attempt(async () => {
				lease = await provider.tryAcquire(lockName, {
					...(options.lockLeaseMs === undefined ? {} : { leaseMs: options.lockLeaseMs }),
				})
				if (!lease) return

				const context = { lockProvider: createHeldLockProvider(lockName, lease) }
				for (const callback of schemaCallbacks) await callback(context)
				if (!options.dataDisabledGlobally) {
					for (const callback of dataCallbacks) await callback(context)
				}
			})
			if (startupResult.error !== null) {
				logger.error({
					msg: options.name + ' Directus startup failed',
					cause: startupResult.error,
				})
			} else if (!lease) {
				logger.info({
					msg: '⏭️ Directus startup skipped; another operation holds the lock',
				})
			}

			if (lease) {
				const releaseResult = await attempt(() => lease?.release())
				if (releaseResult.error !== null) {
					logger.error({
						msg: options.name + ' Directus startup lock release failed',
						cause: releaseResult.error,
					})
				} else {
					logger.debug?.({
						msg: '🔓 Released Directus startup lock',
						extensionId: options.id,
					})
				}
			}
			if (!options.lockProvider) {
				const disposeResult = await attempt(() => configuredProvider.dispose())
				if (disposeResult.error !== null) {
					logger.error({
						msg: options.name + ' Directus startup provider cleanup failed',
						cause: disposeResult.error,
					})
				}
			}
		})()
	})

	return {
		/**
		 * @param callback - Startup schema callback.
		 * @returns Nothing.
		 */
		schema: (callback) => schemaCallbacks.push(callback),
		/**
		 * @param callback - Startup data callback.
		 * @returns Nothing.
		 */
		data: (callback) => dataCallbacks.push(callback),
	}
}
