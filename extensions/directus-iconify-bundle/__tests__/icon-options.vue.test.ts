import { describe, expect, it } from 'vitest'

import iconifyInterface from '../src/iconify-interface/index'

describe('Iconify interface options', () => {
	it('offers static searchable collection choices and keeps proxy enabled by default', () => {
		expect(iconifyInterface.options).toMatchObject([
			{
				field: 'collections',
				meta: {
					interface: 'select-multiple-dropdown',
					options: {
						choices: expect.arrayContaining([{ text: 'mdi', value: 'mdi' }]),
					},
				},
				schema: { default_value: [] },
			},
			{ field: 'useProxy', schema: { default_value: true } },
		])
		const collections = iconifyInterface.options?.[0]?.meta?.options?.choices
		expect(collections?.length).toBeGreaterThan(10)
	})
})
