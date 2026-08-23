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
	isPrimaryKey,
	isRecord,
	isString,
} from '../src/index'

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
		expect(isDefined(0)).toBe(true)
		expect(isArray('value')).toBe(false)
		expect(isString(new String('value'))).toBe(false)
		expect(isNonEmptyString('')).toBe(false)
		expect(isNonBlankString('\n\t')).toBe(false)
		expect(isNumber(Number.POSITIVE_INFINITY)).toBe(true)
		expect(isPrimaryKey('key')).toBe(true)
		expect(isPrimaryKey(1)).toBe(true)
		expect(isPrimaryKey(null)).toBe(false)
		expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false)
		expect(isInteger(2.5)).toBe(false)
		expect(isBoolean(0)).toBe(false)
		expect(isFunction({})).toBe(false)
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
