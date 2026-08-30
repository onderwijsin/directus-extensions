import type { ApiExtensionContext } from '@directus/types'

import { describe, expect, it, vi } from 'vitest'

import {
	docsArticleSchema,
	ensureDirectusDocumentation,
} from '../src/server/directus-ensure/operations/documentation'

const article = {
	id: '7b8b3a1e-38f3-4ab7-9b37-5e4c5d7f1234',
	navigation_label: 'Getting started',
	body: '# Getting started',
}

function createContext(options: {
	env?: Record<string, unknown>
	collectionRead?: () => Promise<unknown>
	itemRead?: () => Promise<unknown>
}) {
	const collectionsService = {
		readOne: vi.fn(options.collectionRead ?? (() => Promise.resolve({}))),
	}
	const itemsService = {
		readOne: vi.fn(options.itemRead ?? (() => Promise.reject(new Error('not found')))),
		createOne: vi.fn(() => Promise.resolve(article.id)),
		updateOne: vi.fn(() => Promise.resolve(article.id)),
	}
	const versionsService = {
		readByQuery: vi.fn(() => Promise.resolve([])),
		createOne: vi.fn(() => Promise.resolve('version-id')),
		save: vi.fn(() => Promise.resolve()),
	}
	const context = {
		env: options.env ?? {},
		database: {},
		getSchema: vi.fn(() => Promise.resolve({})),
		logger: { info: vi.fn(), error: vi.fn() },
		services: {
			CollectionsService: vi.fn(function () {
				return collectionsService
			}),
			ItemsService: vi.fn(function () {
				return itemsService
			}),
			VersionsService: vi.fn(function () {
				return versionsService
			}),
		},
	} as unknown as ApiExtensionContext

	return { context, collectionsService, itemsService, versionsService }
}

describe('Studio Docs article contract', () => {
	it('normalizes optional article fields', () => {
		expect(docsArticleSchema.parse(article)).toEqual({
			...article,
			icon: null,
			archived: false,
		})
	})

	it('rejects an unstable article identity', () => {
		expect(docsArticleSchema.safeParse({ ...article, id: 'article-1' }).success).toBe(false)
	})

	it.each([
		['bundle', { DIRECTUS_DOCS_ENABLED: false }],
		['global', { DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: false }],
	])('does not access Directus when %s seeding is disabled', async (_name, env) => {
		const fixture = createContext({ env })

		await ensureDirectusDocumentation(article, fixture.context)

		expect(fixture.collectionsService.readOne).not.toHaveBeenCalled()
	})

	it('does not access Directus when the participating extension opts out', async () => {
		const fixture = createContext({})

		await ensureDirectusDocumentation(article, fixture.context, { extensionSeedEnabled: false })

		expect(fixture.collectionsService.readOne).not.toHaveBeenCalled()
	})

	it('skips cleanly when the docs collection is not ready', async () => {
		const fixture = createContext({
			collectionRead: () => Promise.reject(new Error('collection is unavailable')),
		})

		await expect(ensureDirectusDocumentation(article, fixture.context)).resolves.toBeUndefined()
		expect(fixture.itemsService.createOne).not.toHaveBeenCalled()
		expect(fixture.context.logger.info).toHaveBeenCalledWith({
			msg: 'Studio Docs article seed skipped; collection is unavailable',
			collection: 'studio_docs',
		})
	})

	it('overrides changed article content when requested', async () => {
		const fixture = createContext({
			itemRead: () =>
				Promise.resolve({
					...article,
					body: 'old body',
				}),
		})

		await ensureDirectusDocumentation(article, fixture.context, { strategy: 'override' })

		expect(fixture.itemsService.updateOne).toHaveBeenCalledWith(article.id, {
			...article,
			icon: null,
			archived: false,
		})
	})

	it('writes changed article content to the incoming version by default', async () => {
		const fixture = createContext({
			itemRead: () =>
				Promise.resolve({
					...article,
					body: 'old body',
				}),
		})

		await ensureDirectusDocumentation(article, fixture.context)

		expect(fixture.versionsService.createOne).toHaveBeenCalledWith({
			collection: 'studio_docs',
			item: article.id,
			key: 'incoming',
			name: 'Incoming',
		})
		expect(fixture.versionsService.save).toHaveBeenCalledWith('version-id', {
			...article,
			icon: null,
			archived: false,
		})
	})
})
