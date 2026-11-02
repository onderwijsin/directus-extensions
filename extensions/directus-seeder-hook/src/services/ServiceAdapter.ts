import type { HookConfig } from '@onderwijsin/directus-extension-utils/types'
import type { SeederOptions } from '../env.schema'
import type { PrimaryKey, SeedItem } from '../lib/seedItem'

/** Directus hook context used by the seeder's service adapters. */
export type ServiceAdapterContext = Omit<Parameters<HookConfig>[1], 'env'> & { env: SeederOptions }

/** Service boundary shared by all three legacy seeding strategies. */
export interface ServiceAdapter {
	/** Reads rows matching the optional Directus query. */
	getItems: (query?: Record<string, unknown>) => Promise<SeedItem[]>
	/** Creates rows and returns their primary keys. */
	createItems: (data: SeedItem[]) => Promise<PrimaryKey[]>
	/** Inserts or updates rows and returns their primary keys. */
	upsertItems: (data: SeedItem[]) => Promise<PrimaryKey[]>
	/** Deletes rows and returns their primary keys. */
	deleteItems: (ids: PrimaryKey[]) => Promise<PrimaryKey[]>
}

/**
 * Provides the original empty defaults for an adapter's unimplemented operations.
 * @param options - Collection-specific operations.
 * @returns A complete service adapter.
 */
export function createServiceAdapter(options: Partial<ServiceAdapter>): ServiceAdapter {
	return {
		/**
		 * Returns an empty default read result.
		 * @returns An empty row list.
		 */
		getItems: () => Promise.resolve([]),
		/**
		 * Returns an empty default create result.
		 * @returns An empty primary-key list.
		 */
		createItems: () => Promise.resolve([]),
		/**
		 * Returns an empty default upsert result.
		 * @returns An empty primary-key list.
		 */
		upsertItems: () => Promise.resolve([]),
		/**
		 * Returns an empty default delete result.
		 * @returns An empty primary-key list.
		 */
		deleteItems: () => Promise.resolve([]),
		...options,
	}
}
