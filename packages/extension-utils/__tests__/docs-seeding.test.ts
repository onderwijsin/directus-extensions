import { describe, expect, it } from 'vitest'

import { docsArticleSchema } from '../src/server/directus-ensure/docs'

const article = {
	uuid: '7b8b3a1e-38f3-4ab7-9b37-5e4c5d7f1234',
	navigation_label: 'Getting started',
	body: '# Getting started',
}

describe('Studio Docs article contract', () => {
	it('normalizes optional article fields', () => {
		expect(docsArticleSchema.parse(article)).toEqual({
			...article,
			sort: 0,
			icon: null,
			archived: false,
		})
	})

	it('rejects an unstable article identity', () => {
		expect(docsArticleSchema.safeParse({ ...article, uuid: 'article-1' }).success).toBe(false)
	})
})
