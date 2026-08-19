import { describe, expect, it } from 'vitest'

import { collectPolicies, nestedRoleFields, parseDepth } from '../src/helpers'

const policy = (id: string) => ({
	id,
	name: id,
	icon: 'policy',
	description: null,
	enforce_tfa: false,
	admin_access: false,
	app_access: true,
})

describe('users policies endpoint helpers', () => {
	it('collects direct, role, and nested role policies without duplicates', () => {
		const shared = policy('shared')

		expect(
			collectPolicies({
				policies: [policy('direct'), shared],
				role: {
					id: 'parent',
					policies: [shared],
					children: [{ id: 'child', policies: [policy('nested')] }],
				},
			}),
		).toEqual([policy('direct'), shared, policy('nested')])
	})

	it('builds a bounded nested relation field', () => {
		expect(nestedRoleFields(0)).toContain('policies.policy.id')
		expect(nestedRoleFields(2)).toContain('children.children.policies.policy.id')
	})

	it('parses an optional non-negative depth', () => {
		expect(parseDepth({ depth: '3' })).toBe(3)
		expect(parseDepth({ depth: ['2'] })).toBe(2)
		expect(parseDepth({ depth: '-1' })).toBeUndefined()
		expect(parseDepth({})).toBeUndefined()
	})
})
