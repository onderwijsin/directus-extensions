import { replaceCollectionNameInSchema } from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it } from 'vitest'

import coolifyApplicationsSchema from '../schema/coolify_applications.json'

describe('Coolify applications schema', () => {
	it('uses the configured collection for every schema resource', () => {
		const schema = replaceCollectionNameInSchema(
			'deployment_targets',
			coolifyApplicationsSchema,
		)
		const collection = schema.collections[0]
		if (!collection) throw new Error('Expected the Coolify applications collection schema')
		const collectionFields = collection.fields
		if (!collectionFields) throw new Error('Expected Coolify applications collection fields')

		expect(collection.collection).toBe('deployment_targets')
		expect(collection.schema?.name).toBe('deployment_targets')
		expect(collectionFields.every((field) => field.collection === 'deployment_targets')).toBe(
			true,
		)
		expect(schema.fields.every((field) => field.collection === 'deployment_targets')).toBe(true)
		expect(schema.relations).toEqual([])
	})
})
