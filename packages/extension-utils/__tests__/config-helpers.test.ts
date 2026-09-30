import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { emptyStringToUndefined } from '../src/server/config/helpers'

describe('emptyStringToUndefined', () => {
	it('treats empty and whitespace-only strings as unset', () => {
		const schema = emptyStringToUndefined(z.string().trim().min(1).optional())

		expect(schema.parse('')).toBeUndefined()
		expect(schema.parse(' \t\n ')).toBeUndefined()
		expect(schema.parse(undefined)).toBeUndefined()
	})

	it('preserves non-blank validation and output', () => {
		const schema = emptyStringToUndefined(z.url().optional())

		expect(schema.parse('https://example.com')).toBe('https://example.com')
		expect(() => schema.parse('not-a-url')).toThrow()
	})
})
