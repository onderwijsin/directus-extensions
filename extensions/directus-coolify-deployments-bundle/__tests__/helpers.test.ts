import { describe, expect, it } from 'vitest'

import { hasAuthenticatedUser } from '../src/coolify-deployments-endpoint/helpers'

const accountability = {
	role: 'role-id',
	roles: ['role-id'],
	user: 'user-id',
	admin: false,
	app: true,
	ip: null,
}

describe('hasAuthenticatedUser', () => {
	it('accepts a complete authenticated accountability', () => {
		expect(hasAuthenticatedUser(accountability)).toBe(true)
	})

	it.each(['role', 'roles', 'user', 'admin', 'app', 'ip'])(
		'rejects accountability without %s',
		(property) => {
			const incomplete = { ...accountability }
			Reflect.deleteProperty(incomplete, property)

			expect(hasAuthenticatedUser(incomplete)).toBe(false)
		},
	)

	it('rejects a public accountability and malformed role lists', () => {
		expect(hasAuthenticatedUser({ ...accountability, user: null })).toBe(false)
		expect(hasAuthenticatedUser({ ...accountability, roles: ['role-id', 42] })).toBe(false)
	})
})
