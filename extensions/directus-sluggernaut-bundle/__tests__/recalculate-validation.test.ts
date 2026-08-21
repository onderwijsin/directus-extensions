import { ForbiddenError } from '@directus/errors'
import { describe, expect, it } from 'vitest'

import { validateRecalculateOptions } from '../src/sluggernaut-recalculate/validation'

const context = (accountability: unknown) => ({ accountability }) as never

describe('Sluggernaut recalculation authorization', () => {
	it('allows internal, null, admin, and admin-access accountability', () => {
		for (const accountability of [null, { admin: true }, { admin_access: true }]) {
			expect(
				validateRecalculateOptions({ collection: 'entries' }, context(accountability)),
			).toEqual({ collection: 'entries', fields: undefined, createRedirects: true })
		}
	})

	it('rejects ordinary and malformed accountability at the forbidden boundary', () => {
		for (const accountability of [
			{ admin: false },
			{ admin_access: false },
			{},
			false,
			'admin',
		]) {
			expect(() =>
				validateRecalculateOptions({ collection: 'entries' }, context(accountability)),
			).toThrow(ForbiddenError)
		}
	})

	it('rejects malformed options after authorization', () => {
		expect(() => validateRecalculateOptions({ collection: '' }, context(null))).toThrow()
		expect(() =>
			validateRecalculateOptions({ collection: 'entries', fields: [null] }, context(null)),
		).toThrow()
		expect(() =>
			validateRecalculateOptions({ collection: 'entries', unknown: true }, context(null)),
		).toThrow()
	})
})
