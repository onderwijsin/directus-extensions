import type { Geometry, PartialNested } from '../src/index'

import { describe, expect, it } from 'vitest'

describe('shared type utilities', () => {
	it('supports recursively partial object values and GeoJSON geometry', () => {
		const partial: PartialNested<{
			settings: { enabled: boolean }
			items: { id: string }[]
		}> = {
			settings: {},
			items: [{}],
		}
		const point: Geometry = { type: 'Point', coordinates: [4.9, 52.3] }
		const partialWithFunction: PartialNested<{
			callback: () => string
			items: { id: string }[]
		}> = {
			callback: () => 'ok',
			items: [{ id: 'item' }],
		}

		expect(partial.items).toEqual([{}])
		expect(point.type).toBe('Point')
		expect(partialWithFunction.callback?.()).toBe('ok')
	})
})
