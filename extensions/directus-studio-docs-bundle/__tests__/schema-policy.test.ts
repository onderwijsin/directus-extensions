import {
	validatePolicyDefinition,
	validateSchemaDefinition,
} from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it } from 'vitest'

import policies from '../schema/policies.json'
import schema from '../schema/studio_docs.json'

describe('Studio Docs schema and policies', () => {
	it('defines the fixed versioned article collection contract', () => {
		const definition = validateSchemaDefinition(schema)
		const collection = definition.collections[0]

		expect(collection?.collection).toBe('studio_docs')
		expect(collection?.schema?.name).toBe('studio_docs')
		expect(collection?.meta).toMatchObject({
			versioning: true,
			archive_field: 'archived',
			archive_app_filter: true,
			archive_value: true,
			unarchive_value: false,
		})
		expect(collection?.fields?.[0]?.field).toBe('id')
		expect(collection?.fields?.[0]?.schema?.is_primary_key).toBe(true)
		expect(definition.fields.map(({ field }) => field)).toEqual([
			'navigation_label',
			'body',
			'sort',
			'archived',
			'date_created',
			'date_updated',
			'icon',
		])
	})

	it('defines unassigned manage and unarchived view policies', () => {
		const definitions = validatePolicyDefinition(policies).policies

		expect(definitions.map(({ name }) => name)).toEqual([
			'Can Manage Studio Docs',
			'Can View Studio Docs',
		])
		expect(definitions[0]?.permissions.map(({ action }) => action)).toEqual([
			'create',
			'read',
			'update',
			'delete',
		])
		expect(definitions[1]?.permissions[0]?.permissions).toEqual({
			archived: { _eq: false },
		})
	})
})
