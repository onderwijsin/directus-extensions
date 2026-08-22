import { describe, expect, it } from 'vitest'

import policies from '../schema/policies.json'
import redirects from '../schema/redirects.json'

describe('Sluggernaut schema and policies', () => {
	it('declares redirect fields, defaults, nullable scheduling, and read-only provenance', () => {
		const fields = redirects.fields
		const byName = new Map(fields.map((field) => [field.field, field]))
		expect(byName.get('origin')?.schema.is_nullable).toBe(false)
		expect(byName.get('destination')?.schema.is_nullable).toBe(false)
		expect(byName.get('type')?.schema.default_value).toBe(301)
		expect(byName.get('is_active')?.schema.default_value).toBe(true)
		for (const field of ['start_date', 'end_date'])
			expect(byName.get(field)?.schema.is_nullable).toBe(true)
		for (const field of [
			'managed_by',
			'source_collection',
			'source_item',
			'source_field',
			'source_type',
			'inactive_reason',
		]) {
			expect(byName.get(field)?.meta.readonly).toBe(true)
		}
		expect(byName.get('inactive_reason')?.meta.options?.choices).toEqual([
			{ text: 'Item was archived', value: 'archived' },
			{ text: 'Item was deleted', value: 'deleted' },
		])
	})

	it('keeps policy permissions least-privilege and does not assign policies automatically', () => {
		expect(policies.policies).toHaveLength(2)
		for (const policy of policies.policies) {
			expect(policy).not.toHaveProperty('roles')
			expect(policy).not.toHaveProperty('users')
			expect(
				policy.permissions.every((permission) => permission.collection === 'redirects'),
			).toBe(true)
		}
		const read = policies.policies.find((policy) => policy.name === 'Can Read Active Redirects')
		expect(read?.permissions[0]?.fields).toEqual(['id', 'origin', 'destination'])
	})
})
