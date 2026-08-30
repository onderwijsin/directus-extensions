import type { RegisterFunctions } from '../../types'
import type { LockLease, LockProvider } from '../lock'
import type { LoggerLike } from '../logger'

import { attempt } from '../../shared/attempt'
import { getDirectusStartupLockName, type DirectusStartupOptions } from './config'
import { resolveDirectusLockProvider, type BaseEnsureOptions } from './operations/core'

/** Options controlling startup coordination registration. */
export interface CreateDirectusStartupCoordinatorOptions {
	/** Stable extension identifier used to derive the shared startup lock name. */
	id: string
	/** Human-readable extension name used in lifecycle log messages. */
	name: string
	/** Disables this extension's startup callbacks. */
	disabled: boolean
	/** Disables all startup callbacks through the global schema-change switch. */
	disabledGlobally: boolean
	/** Disables data callbacks while still allowing schema callbacks to run. */
	dataDisabledGlobally?: boolean
	/** Whether callback, provider, and lost-lease failures reject startup. Defaults to true. */
	abortOnError?: boolean
	/** Consumer-owned lock provider used instead of environment-based provider creation. */
	lockProvider?: LockProvider
	/** Validated environment configuration used to create the lock provider. */
	lockProviderConfig?: DirectusStartupOptions
	/** Lease duration passed to the initial lock acquisition. */
	lockLeaseMs?: number
	/** Whether the coordinator renews its lease while startup callbacks run. Defaults to true. */
	autoRenew?: boolean
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
	tryAcquire: (requestedName) =>
		Promise.resolve(
			requestedName === lockName
				? {
						...lease,
						/**
						 * Returns false because the coordinator owns the underlying lease.
						 * @returns A resolved false value.
						 */
						release: () => Promise.resolve(false),
					}
				: null,
		),
	/**
	 * @param requestedName - Requested lock name.
	 * @returns Whether this is the held lock.
	 */
	isLocked: (requestedName) => Promise.resolve(requestedName === lockName),
})

const DEFAULT_LOCK_LEASE_MS = 30_000
/**
 * Resolves a renewal interval at one third of the configured lease duration.
 * @param leaseMs - Configured lease duration.
 * @returns Renewal interval in milliseconds.
 */
const resolveRenewalIntervalMs = (leaseMs: number | undefined): number =>
	Math.max(1, Math.floor((leaseMs ?? DEFAULT_LOCK_LEASE_MS) / 3))
/**
 * Normalizes a renewal failure into an error suitable for startup reporting.
 * @param error - Renewal failure or undefined when the lease returned false.
 * @returns An error describing the lost lease.
 */
const createLeaseLostError = (error: unknown): Error =>
	error instanceof Error
		? error
		: new Error('Directus startup lock renewal failed', { cause: error })

/**
 * Creates a startup coordinator with one ordered, shared startup lock.
 * @param hook - Directus hook registration functions.
 * @param logger - Logger used for lifecycle and failure messages.
 * @param options - Enablement and lock configuration.
 * @returns A coordinator for registering schema and data callbacks.
 */
export function createDirectusStartupCoordinator(
	hook: RegisterFunctions,
	logger: LoggerLike,
	options: CreateDirectusStartupCoordinatorOptions,
): DirectusStartupCoordinator {
	const schemaCallbacks: ((context: DirectusStartupContext) => Promise<void>)[] = []
	const dataCallbacks: ((context: DirectusStartupContext) => Promise<void>)[] = []
	const lockOptions: BaseEnsureOptions = options

	/**
	 * Runs one startup phase under the coordinator lock.
	 * @param callbacks - Registered callbacks for this phase.
	 * @param containsData - Whether this phase is subject to the data-seed gate.
	 * @returns A promise that resolves when the phase has completed.
	 */
	const runCallbacks = async (
		callbacks: ((context: DirectusStartupContext) => Promise<void>)[],
		containsData: boolean,
	): Promise<void> => {
		// Apply global and extension-level switches before resolving providers or acquiring locks.
		if (options.disabledGlobally) {
			logger.info(options.name + ' Directus startup is disabled globally')
			return
		}
		if (options.disabled) {
			logger.info(options.name + ' Directus startup is disabled for this extension')
			return
		}
		if (containsData && options.dataDisabledGlobally) {
			logger.info(options.name + ' Directus data seeds are disabled globally')
			return
		}

		// Provider construction is isolated so invalid configuration is logged as startup failure.
		const providerResult = await attempt(() => resolveDirectusLockProvider(lockOptions))
		if (providerResult.error !== null) {
			logger.error({
				msg: options.name + ' Directus startup failed',
				cause: providerResult.error,
			})
			if (options.abortOnError ?? true) {
				throw providerResult.error instanceof Error
					? providerResult.error
					: new Error(options.name + ' Directus startup failed', {
							cause: providerResult.error,
						})
			}
			return
		}
		const configuredProvider = providerResult.data
		if (!configuredProvider) return
		const provider = configuredProvider.provider
		const lockName = getDirectusStartupLockName(options.id)
		let lease: LockLease | null = null
		let renewalTimer: ReturnType<typeof setInterval> | undefined
		let renewalError: unknown
		let leaseLost = false
		const startupResult = await attempt(async () => {
			// Acquire one shared lease for every registered schema and data callback.
			lease = await provider.tryAcquire(lockName, {
				...(options.lockLeaseMs === undefined ? {} : { leaseMs: options.lockLeaseMs }),
			})
			if (!lease) return
			const activeLease = lease

			// Keep the shared lease alive while callbacks perform potentially slow Directus writes.
			if (options.autoRenew ?? true) {
				renewalTimer = setInterval(() => {
					void activeLease
						.renew()
						.then((renewed) => {
							if (!renewed) leaseLost = true
						})
						.catch((error: unknown) => {
							leaseLost = true
							renewalError = error
						})
				}, resolveRenewalIntervalMs(options.lockLeaseMs))
			}

			// Nested ensure operations receive a borrowed provider and cannot release this lease.
			const context = { lockProvider: createHeldLockProvider(lockName, lease) }
			for (const callback of callbacks) {
				await callback(context)
				if (leaseLost) throw createLeaseLostError(renewalError)
			}
			// Data callbacks are skipped entirely when global data seeding is disabled.
		})
		let startupError: unknown = null
		if (startupResult.error !== null) {
			logger.error({
				msg: options.name + ' Directus startup failed',
				cause: startupResult.error,
			})
			startupError = startupResult.error
		} else if (!lease) {
			logger.info({
				msg: '⏭️ Directus startup skipped; another operation holds the lock',
			})
		}

		// Stop renewal before releasing the lease or disposing a provider created from config.
		if (lease) {
			if (renewalTimer) clearInterval(renewalTimer)
			const releaseResult = await attempt(() => lease?.release())
			if (releaseResult.error !== null) {
				logger.error({
					msg: options.name + ' Directus startup lock release failed',
					cause: releaseResult.error,
				})
				startupError ??= releaseResult.error
			} else if (releaseResult.data === false) {
				const releaseError = new Error(
					'Directus startup lock ownership was lost before release',
				)
				logger.error({
					msg: options.name + ' Directus startup lock release failed',
					cause: releaseError,
				})
				startupError ??= releaseError
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
		if (startupError !== null && (options.abortOnError ?? true)) {
			throw startupError instanceof Error
				? startupError
				: new Error(options.name + ' Directus startup failed', { cause: startupError })
		}
	}

	hook.init('app.before', async () => runCallbacks(schemaCallbacks, false))
	hook.init('middlewares.before', async () =>
		runCallbacks(options.dataDisabledGlobally ? [] : dataCallbacks, true),
	)

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
