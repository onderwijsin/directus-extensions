import { describe, expect, it } from 'vitest'

import {
	hasKey,
	hasKeys,
	isArray,
	isBoolean,
	isDefined,
	isFiniteNumber,
	isFunction,
	isInteger,
	isNonBlankString,
	isNonEmptyString,
	isNumber,
	isRecord,
	isString,
} from '../src/index.js'

describe('primitive guards', () => {
	it('narrows primitive values', () => {
		expect(isDefined(null)).toBe(true)
		expect(isDefined(undefined)).toBe(false)
		expect(isArray([])).toBe(true)
		expect(isString('value')).toBe(true)
		expect(isNonEmptyString(' ')).toBe(true)
		expect(isNonBlankString(' ')).toBe(false)
		expect(isNumber(Number.NaN)).toBe(true)
		expect(isFiniteNumber(Number.NaN)).toBe(false)
		expect(isInteger(2)).toBe(true)
		expect(isBoolean(false)).toBe(true)
		expect(isFunction(() => undefined)).toBe(true)
	})

	it('narrows records and own keys', () => {
		const value: unknown = { name: 'value' }

		expect(isRecord(value)).toBe(true)
		expect(isRecord([])).toBe(false)
		expect(hasKeys({ name: 'value' })).toBe(true)
		expect(hasKeys({})).toBe(false)
		expect(hasKey({ name: 'value' }, 'name')).toBe(true)
		const inherited: object = Object.create({ name: 'inherited' })
		expect(hasKey(inherited, 'name')).toBe(false)
	})
})
