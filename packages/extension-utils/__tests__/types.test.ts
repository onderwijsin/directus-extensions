import type { PartialNested } from '../src/index'

import { describe, expect, it } from 'vitest'

describe('shared type utilities', () => {
	it('supports recursively partial object values', () => {
		const partial: PartialNested<{
			settings: { enabled: boolean }
			items: { id: string }[]
		}> = {
			settings: {},
			items: [{}],
		}
		const partialWithFunction: PartialNested<{
			callback: () => string
			items: { id: string }[]
		}> = {
			callback: () => 'ok',
			items: [{ id: 'item' }],
		}

		expect(partial.items).toEqual([{}])
		expect(partialWithFunction.callback?.()).toBe('ok')
	})
})
