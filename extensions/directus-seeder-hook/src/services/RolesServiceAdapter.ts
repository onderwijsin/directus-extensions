import type { ServiceAdapter, ServiceAdapterContext } from './ServiceAdapter'

import { createItemsServiceAdapter } from './ItemsServiceAdapter'

/**
 * Reuses the generic role operations and lets Directus handle deletion and its relations.
 * @param context - Directus service and schema context.
 * @returns Role collection operations.
 */
export async function createRolesServiceAdapter(
	context: ServiceAdapterContext,
): Promise<ServiceAdapter> {
	const adapter = await createItemsServiceAdapter('directus_roles', context)
	const rolesService = new context.services.RolesService({ schema: await context.getSchema() })

	return {
		...adapter,
		/**
		 * Deletes roles with Directus's related-record updates and integrity checks.
		 * @param ids - Role primary keys.
		 * @returns Deleted role primary keys.
		 */
		deleteItems: (ids) => rolesService.deleteMany(ids),
	}
}
