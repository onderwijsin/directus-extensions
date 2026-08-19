import {
	withCollectionIdentity,
	validateSchemaDefinition,
} from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it } from 'vitest'

import coolifyApplicationsSchema from '../schema/coolify_applications.json'
import coolifyPolicies from '../schema/coolify_policies.json'

describe('Coolify applications schema', () => {
	it('uses the configured collection for every schema resource', () => {
		const schema = withCollectionIdentity(
			'deployment_targets',
			validateSchemaDefinition(coolifyApplicationsSchema),
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

describe('Coolify policies schema', () => {
	it('defines three policies without permission IDs', () => {
		expect(coolifyPolicies.policies).toHaveLength(3)
		expect(new Set(coolifyPolicies.policies.map((policy) => policy.name))).toEqual(
			new Set([
				'Can manage Coolify applications',
				'Can read Coolify deployments',
				'Can trigger Coolify deployments',
			]),
		)
		expect(
			coolifyPolicies.policies
				.flatMap((policy) => policy.permissions)
				.every((permission) => !('id' in permission)),
		).toBe(true)
		expect(
			coolifyPolicies.policies
				.flatMap((policy) => policy.permissions)
				.every((permission) => permission.collection === 'coolify_applications'),
		).toBe(true)
		const triggerPolicy = coolifyPolicies.policies.find(
			(policy) => policy.name === 'Can trigger Coolify deployments',
		)
		expect(triggerPolicy?.permissions).toEqual([])
	})
})
