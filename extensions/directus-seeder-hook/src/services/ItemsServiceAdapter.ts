import type { PrimaryKey } from '../lib/seedItem'
import type { ServiceAdapter, ServiceAdapterContext } from './ServiceAdapter'

import { createServiceAdapter } from './ServiceAdapter'

/**
 * The legacy mutation boundary intentionally forwards every seed row unchanged.
 * Directus performs payload validation at runtime; validating members here would change
 * the failure location and could turn malformed seed arrays into destructive empty seeds.
 */
interface LegacyMutations {
	/** Creates the original, unvalidated rows using Directus runtime validation. */
	createMany(data: unknown[]): Promise<PrimaryKey[]>
	/** Upserts the original, unvalidated rows using Directus runtime validation. */
	upsertMany(data: unknown[]): Promise<PrimaryKey[]>
}

/**
 * Creates the standard Directus ItemsService adapter with administrator defaults.
 * @param collectionName - Collection to seed.
 * @param context - Directus service and schema context.
 * @returns Collection operations used by the strategies.
 */
export async function createItemsServiceAdapter(
	collectionName: string,
	context: ServiceAdapterContext,
): Promise<ServiceAdapter> {
	const schema = await context.getSchema()
	const itemsService = new context.services.ItemsService(collectionName, { schema })
	const mutations: LegacyMutations = itemsService

	return createServiceAdapter({
		/**
		 * Reads rows through Directus.
		 * @param query - Optional Directus query.
		 * @returns Matching rows.
		 */
		getItems: (query) => itemsService.readByQuery(query ?? {}),
		/**
		 * Forwards the original rows for Directus validation and creation.
		 * @param data - Unmodified seed rows.
		 * @returns Created primary keys.
		 */
		createItems: (data) => mutations.createMany(data),
		/**
		 * Forwards the original rows for Directus validation and upsert.
		 * @param data - Unmodified seed rows.
		 * @returns Upserted primary keys.
		 */
		upsertItems: (data) => mutations.upsertMany(data),
		/**
		 * Deletes rows using their primary keys.
		 * @param ids - Primary keys to delete.
		 * @returns Deleted primary keys.
		 */
		deleteItems: (ids) => itemsService.deleteMany(ids),
	})
}
