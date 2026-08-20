import type { ApiExtensionContext, Relation, SchemaOverview } from '@directus/types'
import type { LockProvider } from '../../lock'
import type { LoggerLike } from '../../logger'
import type { DirectusPolicyDefinition } from '../data-processors/policies'

import { createMemoryLockProvider } from '../../lock'
import { getDirectusStartupLockName, type DirectusStartupOptions } from '../config'
import { createStartupLockProvider } from '../provider'

type Database = ApiExtensionContext['database']
type Services = ApiExtensionContext['services']

/** Portable Directus schema data shipped by an extension. */
export interface DirectusSchemaDefinition {
	collections: import('@directus/types').RawCollection[]
	fields: import('@directus/types').RawField[]
	relations: Partial<Relation>[]
}

/** Shared options for all Directus ensure operations. */
export interface BaseEnsureOptions {
	/** Whether unexpected service failures should be rethrown. */
	abortOnError?: boolean
	/** Lock provider selected by the consumer. */
	lockProvider?: LockProvider
	/** Validated environment configuration used when no provider is supplied directly. */
	lockProviderConfig?: DirectusStartupOptions
	/** Lock lease duration in milliseconds. */
	lockLeaseMs?: number
}

/** Shared input contract for Directus ensure operations. */
export interface BaseEnsureInput {
	id: string
	database: Database
	getSchema: (options?: { database?: Database; bypassCache?: boolean }) => Promise<SchemaOverview>
	logger: LoggerLike
	services: Services
	options?: BaseEnsureOptions
}

/** Options for one schema ensure operation. */
export type EnsureDirectusSchemaOptions = BaseEnsureOptions

/** Options needed to resolve the provider for startup coordination. */
export type DirectusStartupStatusOptions = Pick<
	BaseEnsureOptions,
	'lockProvider' | 'lockProviderConfig'
>

/** Input for a read-only Directus startup lock status query. */
export interface DirectusStartupStatusInput {
	id: string
	options?: DirectusStartupStatusOptions
}

/** Current lock state for one extension startup operation. */
export interface DirectusStartupStatus {
	isLocked: boolean
}

/** Arguments accepted by ensureDirectusSchema. */
export interface EnsureDirectusSchemaInput extends BaseEnsureInput {
	definition: DirectusSchemaDefinition
}

/** Input accepted by ensureDirectusPolicy. */
export interface EnsureDirectusPolicyInput extends BaseEnsureInput {
	definition: DirectusPolicyDefinition
}

/** Result of one ensure operation. */
export interface EnsureDirectusSchemaResult {
	changed: string[]
	skipped: boolean
}

const fallbackLockProvider = createMemoryLockProvider()

/**
 * Releases no resources for a provider owned by the caller or fallback provider.
 * @returns A resolved promise.
 */
const disposeNoop = (): Promise<void> => Promise.resolve()

/**
 * Resolves the configured startup lock provider and its cleanup function.
 * @param options - Provider options supplied by the consumer.
 * @returns The provider and its owned-resource cleanup function.
 */
export const resolveDirectusLockProvider = (
	options: DirectusStartupStatusOptions,
): { provider: LockProvider; dispose: () => Promise<void> } =>
	options.lockProvider
		? { provider: options.lockProvider, dispose: disposeNoop }
		: options.lockProviderConfig
			? createStartupLockProvider(options.lockProviderConfig)
			: { provider: fallbackLockProvider, dispose: disposeNoop }

/**
 * Checks whether an extension's startup lock is currently held.
 * @param input - Extension identifier and provider options.
 * @returns Whether the startup lock is currently held.
 */
export async function getDirectusStartupStatus(
	input: DirectusStartupStatusInput,
): Promise<DirectusStartupStatus> {
	const options = input.options ?? {}
	const configuredProvider = resolveDirectusLockProvider(options)

	try {
		return {
			isLocked: await configuredProvider.provider.isLocked(
				getDirectusStartupLockName(input.id),
			),
		}
	} finally {
		if (!options.lockProvider) await configuredProvider.dispose()
	}
}
