import type { Accountability } from '@directus/types'
import type { Request } from 'express'

import { describe, expect, it } from 'vitest'

import {
	assertRequestWithAccountability,
	getAccountabilityFromRequest,
	hasAuthenticatedUser,
	isAccountability,
} from '../src/server/accountability'

const accountability: Accountability = {
	role: 'role-id',
	roles: ['role-id'],
	user: 'user-id',
	admin: false,
	app: true,
	ip: null,
}

describe('accountability helpers', () => {
	it('recognizes structurally valid accountability values', () => {
		expect(isAccountability(accountability)).toBe(true)
		expect(isAccountability(null)).toBe(false)
		expect(isAccountability([])).toBe(false)
		expect(isAccountability({ ...accountability, admin: 'true' })).toBe(false)
		expect(isAccountability({ ...accountability, roles: 'role-id' })).toBe(false)
	})

	it('recognizes accountabilities with an authenticated user', () => {
		expect(hasAuthenticatedUser(accountability)).toBe(true)
		expect(hasAuthenticatedUser({ ...accountability, user: null })).toBe(false)
		expect(hasAuthenticatedUser({ ...accountability, user: 42 })).toBe(false)
	})

	it('asserts a request accountability property', () => {
		const authenticatedRequest = { accountability } as unknown as Request
		const unauthenticatedRequest = {
			accountability: { ...accountability, user: null },
		} as unknown as Request

		expect(assertRequestWithAccountability(authenticatedRequest)).toBe(true)
		expect(assertRequestWithAccountability(unauthenticatedRequest)).toBe(true)
		expect(assertRequestWithAccountability({} as unknown as Request)).toBe(false)
		expect(
			assertRequestWithAccountability({ accountability: null } as unknown as Request),
		).toBe(false)
	})

	it('returns accountability or null without changing request data', () => {
		const request = { accountability } as unknown as Request
		const malformedRequest = { accountability: { user: 'user-id' } } as unknown as Request

		expect(getAccountabilityFromRequest(request)).toBe(accountability)
		expect(getAccountabilityFromRequest(malformedRequest)).toBeNull()
		expect(getAccountabilityFromRequest({} as unknown as Request)).toBeNull()
	})
})
