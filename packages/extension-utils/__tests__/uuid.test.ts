import { describe, expect, it } from 'vitest'

import { uuid, uuidv4, UUID_NAMESPACE_URL } from '../src/index'

describe('UUID utilities', () => {
	it('generates UUID v7 values by default', () => {
		expect(uuid()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
		)
	})

	it('generates UUID v4 values explicitly', () => {
		expect(uuidv4()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
		)
	})

	it('generates stable UUID v5 values when an input is supplied', () => {
		const first = uuid('external-item')
		const second = uuid('external-item')

		expect(first).toBe(second)
		expect(first).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
		)
		expect(uuid('external-item', UUID_NAMESPACE_URL)).toBe(first)
		expect(uuid('another-item')).not.toBe(first)
	})

	it('rejects malformed UUID namespaces', () => {
		expect(() => uuid('input', 'not-a-uuid')).toThrow()
	})
})
