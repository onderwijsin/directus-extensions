import { describe, expect, it } from 'vitest'

import { createAdminAccountability, createSystemAdminAccountability } from '../src/constants'

describe('accountability factories', () => {
	it('creates an admin accountability object', () => {
		expect(createAdminAccountability()).toEqual({
			role: null,
			roles: [],
			user: null,
			admin: true,
			app: false,
			ip: null,
		})
	})

	it('creates a system admin accountability object', () => {
		expect(createSystemAdminAccountability()).toMatchObject({
			admin: true,
			user: 'system',
		})
	})

	it('returns fresh objects', () => {
		expect(createAdminAccountability()).not.toBe(createAdminAccountability())
	})
})
