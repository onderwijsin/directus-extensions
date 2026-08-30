import { describe, expect, it } from 'vitest'

import { canonicalArticle, extractMappedArticles } from './docs-extract.mjs'

describe('docs extraction', () => {
	it('writes only articles with mapped IDs', () => {
		const result = extractMappedArticles(
			[
				{ id: 'known', navigation_label: 'Known', body: '# Known' },
				{ id: 'unknown', navigation_label: 'Unknown', body: '# Unknown' },
			],
			{ known: 'extensions/example/docs/known.json' },
		)

		expect(result).toEqual([
			{
				article: {
					body: '# Known',
					icon: null,
					navigation_label: 'Known',
					id: 'known',
				},
				path: 'extensions/example/docs/known.json',
			},
		])
	})

	it('preserves the published canonical fields', () => {
		expect(
			canonicalArticle({
				id: 'known',
				navigation_label: 'Known',
				body: '# Known',
				icon: 'book',
				archived: true,
				user_created: 'ignored',
			}),
		).toEqual({
			body: '# Known',
			icon: 'book',
			navigation_label: 'Known',
			id: 'known',
		})
	})
})
