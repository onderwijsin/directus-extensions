import {
	replaceCollectionNameInSchema,
	type DirectusSchemaDefinition,
} from '@onderwijsin/directus-extension-utils/server'

import magicLinksSchema from '../../schema/directus_magic_links.json'

/**
 * Creates the magic-links schema definition for the configured collection.
 *
 * @param collection - Configured magic-links collection name.
 * @returns Schema definition with every magic-links collection reference transformed.
 */
export const createMagicLinksSchema = (collection: string): DirectusSchemaDefinition => {
	return replaceCollectionNameInSchema(collection, magicLinksSchema)
}
