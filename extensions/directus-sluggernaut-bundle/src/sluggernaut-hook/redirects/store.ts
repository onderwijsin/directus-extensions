import type { ApiExtensionContext } from '@directus/types'
import type { RedirectStore } from './service'

/**
 * Creates an ItemsService-backed redirect store.
 * @param context - Directus services and schema access.
 * @param collection - Configured redirect collection.
 * @param database - Database handle for the current lifecycle.
 * @returns Redirect store bound to the supplied database handle.
 */
export async function createRedirectStore(
	context: Pick<ApiExtensionContext, 'services' | 'getSchema'>,
	collection: string,
	database: ApiExtensionContext['database'],
): Promise<RedirectStore> {
	const schema = await context.getSchema()
	return new context.services.ItemsService(collection, {
		schema,
		accountability: null,
		knex: database,
	})
}
