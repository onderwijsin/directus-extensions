import { describe, expect, it } from 'vitest'

import { createJsonFormatter } from '../src/lib/formatJson'

describe('extraction formatter runtime', () => {
	it('preflights the installed native formatter and preserves JSON content', async () => {
		const format = await createJsonFormatter()
		const data = [{ id: 'fixture', nested: { enabled: true }, label: 'Dutch: één' }]
		const result = await format('directus_translations.json', JSON.stringify(data))
		expect(JSON.parse(result)).toEqual(data)
		expect(result.endsWith('\n')).toBe(true)
	})
})
