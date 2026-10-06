import { describe, expect, it } from 'vitest'

import {
	recalculationFields,
	withRecalculationScope,
} from '../src/sluggernaut-hook/mutation/recalculation-context'

describe('recalculation selection context', () => {
	it('applies only to the selected item and restores context after a failed write', async () => {
		expect(recalculationFields('entries', 1)).toBeUndefined()
		await expect(
			withRecalculationScope(
				{ collection: 'entries', key: 1, fields: new Set(['slug']) },
				async () => {
					await Promise.resolve()
					expect([...(recalculationFields('entries', 1) ?? [])]).toEqual(['slug'])
					expect(recalculationFields('other', 1)).toBeUndefined()
					expect(recalculationFields('entries', 2)).toBeUndefined()
					throw new Error('write failed')
				},
			),
		).rejects.toThrow('write failed')
		expect(recalculationFields('entries', 1)).toBeUndefined()
	})

	it('isolates concurrent recalculations of the same item', async () => {
		await Promise.all(
			['slug', 'permalink'].map((field) =>
				withRecalculationScope(
					{ collection: 'entries', key: 1, fields: new Set([field]) },
					async () => {
						await Promise.resolve()
						expect([...(recalculationFields('entries', 1) ?? [])]).toEqual([field])
					},
				),
			),
		)
		expect(recalculationFields('entries', 1)).toBeUndefined()
	})
})
