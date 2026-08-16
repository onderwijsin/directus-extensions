import { describe, expect, it } from 'vitest'

import { fromEntries, keys, toEntries } from '../src/index'

describe('object utilities', () => {
	it('converts objects to typed entries and keys', () => {
		const value = { count: 1, label: 'one' } as const

		expect(toEntries(value)).toEqual([
			['count', 1],
			['label', 'one'],
		])
		expect(keys(value)).toEqual(['count', 'label'])
	})

	it('creates objects from iterable entries', () => {
		expect(
			fromEntries<string, number | string>([
				['count', 1],
				['label', 'one'],
			]),
		).toEqual({
			count: 1,
			label: 'one',
		})
		expect(fromEntries(new Map([['enabled', true]]))).toEqual({ enabled: true })
		expect(
			fromEntries([
				['value', 1],
				['value', 2],
			]),
		).toEqual({ value: 2 })
	})

	it('supports symbol keys when creating objects', () => {
		const symbol = Symbol('key')

		expect(fromEntries([[symbol, 'value']])).toEqual({ [symbol]: 'value' })
	})

	it('uses own enumerable string keys only', () => {
		const inherited = Object.create({ inherited: true }) as { own?: boolean }
		inherited.own = true

		expect(keys(inherited)).toEqual(['own'])
		expect(toEntries(inherited)).toEqual([['own', true]])

		const withSymbol = { visible: true, [Symbol('hidden')]: true }
		expect(keys(withSymbol)).toEqual(['visible'])
		expect(toEntries(withSymbol)).toEqual([['visible', true]])
	})
})
