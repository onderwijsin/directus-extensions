import {
	withCollectionIdentity,
	validateSchemaDefinition,
} from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it } from 'vitest'

import magicLinksSchema from '../schema/magic_links.json'

describe('magic-links schema', () => {
	it('uses the configured collection for collections, fields, and relations', () => {
		const schema = withCollectionIdentity(
			'custom_links',
			validateSchemaDefinition(magicLinksSchema),
		)
		const collection = schema.collections[0]
		if (!collection) throw new Error('Expected the magic-links collection schema')
		const collectionFields = collection.fields
		if (!collectionFields) throw new Error('Expected magic-links collection fields')

		expect(schema.collections).toHaveLength(1)
		expect(collection.collection).toBe('custom_links')
		expect(collection.schema?.name).toBe('custom_links')
		expect(collectionFields.every((field) => field.collection === 'custom_links')).toBe(true)
		expect(schema.fields.every((field) => field.collection === 'custom_links')).toBe(true)
		expect(schema.relations[0]).toMatchObject({
			collection: 'custom_links',
			meta: { many_collection: 'custom_links' },
		})
	})
})
