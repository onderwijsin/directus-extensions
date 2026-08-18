import type { DirectusSchemaDefinition } from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_NAME } from '.'
import magicLinksSchema from '../../schema/directus_magic_links.json'

/**
 * Creates the magic-links schema definition for the configured collection.
 *
 * @param collection - Configured magic-links collection name.
 * @returns Schema definition with every magic-links collection reference transformed.
 */
export const createMagicLinksSchema = (collection: string): DirectusSchemaDefinition => {
	const serializedSchema = JSON.stringify(magicLinksSchema)
	const collectionReference = JSON.stringify(EXTENSION_NAME)
	const configuredReference = JSON.stringify(collection)

	return JSON.parse(
		serializedSchema.replaceAll(collectionReference, configuredReference),
	) as DirectusSchemaDefinition
}
