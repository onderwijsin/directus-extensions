import { describe, expect, it } from 'vitest'

import { generateDeterministicUUID, generateUUID, UUID_NAMESPACE_URL } from '../src/index.js'

describe('UUID utilities', () => {
	it('generates UUID v4 values', () => {
		expect(generateUUID()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
		)
	})

	it('generates stable UUID v5 values for an input and namespace', () => {
		const first = generateDeterministicUUID('external-item')
		const second = generateDeterministicUUID('external-item')

		expect(first).toBe(second)
		expect(first).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
		)
		expect(generateDeterministicUUID('external-item', UUID_NAMESPACE_URL)).toBe(first)
		expect(generateDeterministicUUID('another-item')).not.toBe(first)
		expect(
			generateDeterministicUUID('external-item', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
		).not.toBe(first)
	})

	it('rejects malformed UUID namespaces', () => {
		expect(() => generateDeterministicUUID('input', 'not-a-uuid')).toThrow()
	})
})
