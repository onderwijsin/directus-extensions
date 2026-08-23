import type { ApiExtensionContext } from '@directus/types'
import type { Redirect } from './schema'

/**
 * Creates an ItemsService-backed redirect service.
 * @param context - Directus services and schema access.
 * @param collection - Configured redirect collection.
 * @param database - Database handle for the current lifecycle.
 * @returns Redirect service bound to the supplied database handle.
 */
export async function createRedirectService(
	context: Pick<ApiExtensionContext, 'services' | 'getSchema'>,
	collection: string,
	database: ApiExtensionContext['database'],
) {
	const schema = await context.getSchema()
	return new context.services.ItemsService<Redirect>(collection, {
		schema,
		accountability: null,
		knex: database,
	})
}

export type RedirectService = Awaited<ReturnType<typeof createRedirectService>>
