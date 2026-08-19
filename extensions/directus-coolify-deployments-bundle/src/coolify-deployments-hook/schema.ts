import {
	replaceCollectionNameInSchema,
	type DirectusSchemaDefinition,
} from '@onderwijsin/directus-extension-utils/server'

import coolifyApplicationsSchema from '../../schema/coolify_applications.json'

/**
 * Creates the Coolify applications schema definition.
 * @param collection - Configured collection name.
 * @returns The portable Directus schema definition.
 */
export const createCoolifyApplicationsSchema = (collection: string): DirectusSchemaDefinition => {
	return replaceCollectionNameInSchema(collection, coolifyApplicationsSchema)
}
