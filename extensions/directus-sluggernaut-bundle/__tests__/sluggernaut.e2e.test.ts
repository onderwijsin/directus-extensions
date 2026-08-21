import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createCollection,
	createField,
	createItem,
	createItems,
	customEndpoint,
	deleteCollection,
	deleteItem,
	readItems,
	updateItem,
	updateItems,
} from '@workspace/test-utils/commands'
import { describe, expect, it } from 'vitest'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN
const composeFilesValue = process.env.DIRECTUS_E2E_COMPOSE_FILES
const composeProject = process.env.DIRECTUS_E2E_COMPOSE_PROJECT

if (!baseUrl || !token || !composeFilesValue || !composeProject) {
	throw new Error('The Directus E2E environment was not initialized')
}

const composeFiles = JSON.parse(composeFilesValue)
if (!Array.isArray(composeFiles) || composeFiles.some((file) => typeof file !== 'string')) {
	throw new Error('The Directus E2E Compose file list is invalid')
}

const client = createDirectusE2EClient({ baseUrl, token, composeFiles, composeProject })

interface RedirectRecord {
	id: string
	origin: string
	destination: string
	type: number
	is_active: boolean
	managed_by: string | null
	source_collection: string | null
	source_item: string | null
	source_field: string | null
	inactive_reason: string | null
}

const slugOptions = {
	sourceFields: ['title'],
	locale: 'en',
	lowercase: true,
	updateOnSourceChange: true,
	automaticRedirects: false,
}

interface PermalinkTestOptions {
	generateFromSlug: boolean
	slugField: string
	updateOnSlugChange: boolean
	prefix: string
	validatePrefixOnManualInput: boolean
	trailingSlash: boolean
	enforceTrailingSlashOnManualInput: boolean
	automaticRedirects: boolean
	includeUnmanagedRedirectsInPlanning: boolean
	unmanagedRedirectConflictBehavior: 'override' | 'block'
}

const permalinkOptions: PermalinkTestOptions = {
	generateFromSlug: true,
	slugField: 'slug',
	updateOnSlugChange: true,
	prefix: '/articles',
	validatePrefixOnManualInput: false,
	trailingSlash: false,
	enforceTrailingSlashOnManualInput: false,
	automaticRedirects: true,
	includeUnmanagedRedirectsInPlanning: true,
	unmanagedRedirectConflictBehavior: 'override',
}

async function createSluggernautCollection(
	permalinkOverrides: Partial<typeof permalinkOptions> = {},
	slugOverrides: Partial<typeof slugOptions> = {},
	fixtureOptions: {
		includePrimarySlug?: boolean
		slugSchema?: { max_length?: number }
		archiveMetadata?: boolean
	} = {},
): Promise<{
	collection: 'sluggernaut_e2e'
	dispose: () => Promise<void>
}> {
	const collection = 'sluggernaut_e2e'

	await client.request(
		createCollection({
			collection,
			meta: {
				icon: 'article',
				note: 'Created for Sluggernaut E2E tests',
				...(fixtureOptions.archiveMetadata === false
					? {}
					: {
							archive_field: 'status',
							archive_value: 'archived',
							unarchive_value: 'published',
						}),
			},
			schema: {},
		}),
	)
	await client.request(
		createField(collection, {
			field: 'title',
			type: 'string',
			meta: { interface: 'input' },
			schema: { is_nullable: true },
		}),
	)
	for (const field of ['category', 'notes']) {
		await client.request(
			createField(collection, {
				field,
				type: 'string',
				meta: { interface: 'input' },
				schema: { is_nullable: true },
			}),
		)
	}
	for (const field of ['source_a', 'source_b', 'source_c', 'source_d']) {
		await client.request(
			createField(collection, {
				field,
				type: 'string',
				meta: { interface: 'input' },
				schema: { is_nullable: true },
			}),
		)
	}
	for (const [field, type] of [
		['source_e', 'integer'],
		['source_f', 'boolean'],
	] as const) {
		await client.request(
			createField(collection, {
				field,
				type,
				meta: { interface: 'input' },
				schema: { is_nullable: true },
			}),
		)
	}
	for (const field of ['headline-with-hyphen', 'headline_$value']) {
		await client.request(
			createField(collection, {
				field,
				type: 'string',
				meta: { interface: 'input' },
				schema: { is_nullable: true },
			}),
		)
	}
	await client.request(
		createField(collection, {
			field: 'status',
			type: 'string',
			meta: { interface: 'input' },
			schema: { default_value: 'published', is_nullable: false },
		}),
	)
	if (fixtureOptions.includePrimarySlug !== false) {
		await client.request(
			createField(collection, {
				field: 'slug',
				type: 'string',
				meta: {
					interface: 'sluggernaut-slug',
					options: { ...slugOptions, ...slugOverrides },
				},
				schema: { is_nullable: true, ...fixtureOptions.slugSchema },
			}),
		)
	}
	await client.request(
		createField(collection, {
			field: 'permalink',
			type: 'string',
			meta: {
				interface: 'sluggernaut-permalink',
				options: { ...permalinkOptions, ...permalinkOverrides },
			},
			schema: { is_nullable: true },
		}),
	)
	if (fixtureOptions.includePrimarySlug !== false) {
		await client.request(
			createField(collection, {
				field: 'slug_secondary',
				type: 'string',
				meta: {
					interface: 'sluggernaut-slug',
					options: {
						...slugOptions,
						sourceFields: ['category'],
						automaticRedirects: false,
					},
				},
				schema: { is_nullable: true },
			}),
		)
		await client.request(
			createField(collection, {
				field: 'permalink_secondary',
				type: 'string',
				meta: {
					interface: 'sluggernaut-permalink',
					options: {
						...permalinkOptions,
						slugField: 'slug_secondary',
						prefix: '/secondary',
						automaticRedirects: false,
					},
				},
				schema: { is_nullable: true },
			}),
		)
	}

	return {
		collection,
		dispose: async () => {
			const redirects = await client.request<Pick<RedirectRecord, 'id'>[]>(
				readItems('redirects', {
					filter: { source_collection: { _eq: collection } },
					fields: ['id'],
				}),
			)
			for (const redirect of redirects) {
				await client.request(deleteItem('redirects', redirect.id)).catch(() => undefined)
			}
			await client.request(deleteCollection(collection)).catch(() => undefined)
		},
	}
}

function readRedirects(collection: string, sourceItem?: string): Promise<RedirectRecord[]> {
	return client.request(
		readItems('redirects', {
			filter: {
				source_collection: { _eq: collection },
				...(sourceItem ? { source_item: { _eq: sourceItem } } : {}),
			},
			fields: [
				'id',
				'origin',
				'destination',
				'type',
				'is_active',
				'managed_by',
				'source_collection',
				'source_item',
				'source_field',
				'inactive_reason',
			],
			sort: ['origin'],
		}),
	)
}

async function createRedirect(overrides: Record<string, unknown>): Promise<{ id: string }> {
	return client.request(
		createItem('redirects', {
			origin: '/seeded-old',
			destination: '/seeded-new',
			type: 301,
			is_active: true,
			managed_by: 'sluggernaut',
			source_collection: 'sluggernaut_e2e',
			source_item: '1',
			source_field: 'permalink',
			source_type: 'permalink',
			inactive_reason: null,
			...overrides,
		}),
	)
}

describe('Sluggernaut Directus integration', () => {
	it('E01 derives a normalized slug and permalink when creating an item', async () => {
		const fixture = await createSluggernautCollection()
		try {
			await expect(
				client.request(createItem(fixture.collection, { title: 'Summer News' })),
			).resolves.toMatchObject({
				title: 'Summer News',
				slug: 'summer-news',
				permalink: '/articles/summer-news',
			})
		} finally {
			await fixture.dispose()
		}
	})

	it('E05 normalizes explicit slug and permalink values before persisting them', async () => {
		const fixture = await createSluggernautCollection()
		try {
			await expect(
				client.request(
					createItem(fixture.collection, {
						title: 'Ignored Source',
						slug: ' Café / Déjà Vu! ',
						permalink: ' /landing// ',
					}),
				),
			).resolves.toMatchObject({
				title: 'Ignored Source',
				slug: 'cafe-deja-vu',
				permalink: '/landing/',
			})
		} finally {
			await fixture.dispose()
		}
	})

	it('E27 derives each item independently during bulk creation', async () => {
		const fixture = await createSluggernautCollection()
		try {
			const created = await client.request(
				createItems(fixture.collection, [
					{ title: 'First Bulk Item' },
					{ title: 'Second Bulk Item', category: 'News' },
					{
						title: 'Third Bulk Item',
						slug: 'Manual Bulk Item',
						permalink: '/custom/bulk',
					},
				]),
			)

			expect(created).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						title: 'First Bulk Item',
						slug: 'first-bulk-item',
						permalink: '/articles/first-bulk-item',
					}),
					expect.objectContaining({
						title: 'Second Bulk Item',
						slug: 'second-bulk-item',
						permalink: '/articles/second-bulk-item',
					}),
					expect.objectContaining({
						title: 'Third Bulk Item',
						slug: 'manual-bulk-item',
						permalink: '/custom/bulk',
					}),
				]),
			)
		} finally {
			await fixture.dispose()
		}
	})

	it('E21 rejects a manual permalink outside its configured prefix', async () => {
		const fixture = await createSluggernautCollection({ validatePrefixOnManualInput: true })
		try {
			await expect(
				client.request(
					createItem(fixture.collection, {
						title: 'Outside Prefix',
						permalink: '/landing',
					}),
				),
			).rejects.toThrow('The permalink is outside the configured prefix.')
		} finally {
			await fixture.dispose()
		}
	})

	it('E18 preserves a manual permalink when slug synchronization is disabled', async () => {
		const fixture = await createSluggernautCollection({ updateOnSlugChange: false })
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, {
					title: 'Original Title',
					permalink: '/articles/manual-path',
				}),
			)
			itemId = String(created.id)

			await expect(
				client.request(
					updateItem(fixture.collection, created.id, { title: 'Changed Title' }),
				),
			).resolves.toMatchObject({
				slug: 'changed-title',
				permalink: '/articles/manual-path',
			})
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E12 E19 E47 E66 E67 E68 handles update and redirect lifecycle changes', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Original Title' }),
			)
			itemId = String(created.id)

			await client.request(updateItem(fixture.collection, created.id, { title: 'New Title' }))
			await expect
				.poll(() => readRedirects(fixture.collection, itemId))
				.toEqual([
					expect.objectContaining({
						origin: '/articles/original-title',
						destination: '/articles/new-title',
						type: 301,
						is_active: true,
						managed_by: 'sluggernaut',
						source_field: 'permalink',
					}),
				])

			await client.request(updateItem(fixture.collection, created.id, { status: 'archived' }))
			await expect
				.poll(() => readRedirects(fixture.collection, itemId))
				.toEqual([
					expect.objectContaining({
						is_active: false,
						inactive_reason: 'archive',
					}),
				])

			await client.request(
				updateItem(fixture.collection, created.id, { status: 'published' }),
			)
			await expect
				.poll(() => readRedirects(fixture.collection, itemId))
				.toEqual([
					expect.objectContaining({
						is_active: true,
						inactive_reason: null,
					}),
				])

			await client.request(deleteItem(fixture.collection, created.id))
			await expect
				.poll(() => readRedirects(fixture.collection, itemId))
				.toEqual([
					expect.objectContaining({
						origin: '/articles/original-title',
						destination: '/articles/new-title',
						is_active: false,
						inactive_reason: 'delete',
					}),
				])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E02 joins two configured source fields in order', async () => {
		const fixture = await createSluggernautCollection(
			{},
			{ sourceFields: ['title', 'category'] },
		)
		try {
			await expect(
				client.request(
					createItem(fixture.collection, { title: '  Summer  ', category: ' News ' }),
				),
			).resolves.toMatchObject({
				slug: 'summer-news',
				permalink: '/articles/summer-news',
			})
		} finally {
			await fixture.dispose()
		}
	})

	it('E03 handles null, omitted, empty, whitespace, zero, and false sources', async () => {
		const fixture = await createSluggernautCollection(
			{},
			{
				sourceFields: [
					'source_a',
					'source_b',
					'source_c',
					'source_d',
					'source_e',
					'source_f',
				],
			},
		)
		try {
			await expect(
				client.request(
					createItem(fixture.collection, {
						source_a: null,
						source_c: '',
						source_d: '  ',
						source_e: 0,
						source_f: false,
					}),
				),
			).resolves.toMatchObject({ slug: null, permalink: null })
		} finally {
			await fixture.dispose()
		}
	})

	it('E04 clears slug and permalink when all source material is punctuation-only', async () => {
		const fixture = await createSluggernautCollection(
			{},
			{ sourceFields: ['source_a', 'source_b'] },
		)
		try {
			await expect(
				client.request(
					createItem(fixture.collection, { source_a: '---', source_b: '!!!' }),
				),
			).resolves.toMatchObject({ slug: null, permalink: null })
		} finally {
			await fixture.dispose()
		}
	})

	it('E06 rejects invalid explicit slug and permalink types without creating an item', async () => {
		const fixture = await createSluggernautCollection()
		try {
			await expect(
				client.request(
					customEndpoint({
						path: `/items/${fixture.collection}`,
						method: 'POST',
						body: JSON.stringify({
							title: 'Invalid Types',
							slug: 42,
							permalink: { bad: true },
						}),
					}),
				),
			).rejects.toThrow()
			await expect(
				client.request(
					readItems(fixture.collection, {
						filter: { title: { _eq: 'Invalid Types' } },
						fields: ['id'],
					}),
				),
			).resolves.toEqual([])
		} finally {
			await fixture.dispose()
		}
	})

	it('E07 accepts every supported locale family without mojibake', async () => {
		const localeValues = [
			['nl', 'IJsselmeer'],
			['en', 'Hello World'],
			['bg', 'Здравей свят'],
			['de', 'Äpfel Über'],
			['es', '¡Hola Señor!'],
			['fr', 'École française'],
			['pt', 'Ação pública'],
			['uk', 'Київ новини'],
			['vi', 'Tiếng Việt'],
			['da', 'Rødgrød'],
			['nb', 'Blåbær'],
			['it', 'Città nuova'],
			['sv', 'Ångström'],
		] as const

		for (const [locale, title] of localeValues) {
			const fixture = await createSluggernautCollection({}, { locale })
			try {
				const item = await client.request(createItem(fixture.collection, { title }))
				expect(item.slug).toEqual(
					expect.stringMatching(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u),
				)
				expect(item.permalink).toEqual(
					expect.stringMatching(/^\/articles\/[\p{L}\p{N}-]+$/u),
				)
			} finally {
				await fixture.dispose()
			}
		}
	})

	it('E08 normalizes repeated punctuation, emoji, RTL text, and mixed scripts safely', async () => {
		const fixture = await createSluggernautCollection()
		try {
			const item = await client.request(
				createItem(fixture.collection, {
					title: '  Hello___world 😀 שלום العربية Русский!!!  ',
				}),
			)
			expect(item.slug).toEqual(expect.stringMatching(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u))
			expect(item.permalink).toEqual(expect.stringMatching(/^\/articles\/[\p{L}\p{N}-]+$/u))
		} finally {
			await fixture.dispose()
		}
	})

	it('E09 discovers source fields with non-conventional keys', async () => {
		const fixture = await createSluggernautCollection(
			{},
			{ sourceFields: ['headline-with-hyphen', 'headline_$value'] },
		)
		try {
			await expect(
				client.request(
					createItem(fixture.collection, {
						'headline-with-hyphen': 'Hello',
						headline_$value: 'World',
					}),
				),
			).resolves.toMatchObject({ slug: 'hello-world', permalink: '/articles/hello-world' })
		} finally {
			await fixture.dispose()
		}
	})

	it('E10 creates duplicate source text without hidden uniqueness behavior', async () => {
		const fixture = await createSluggernautCollection()
		try {
			const items = await client.request(
				createItems(fixture.collection, [{ title: 'Same Text' }, { title: 'Same Text' }]),
			)
			expect(items).toHaveLength(2)
			expect(items[0]?.id).not.toBe(items[1]?.id)
			expect(items[0]?.slug).toBe('same-text')
			expect(items[1]?.slug).toBe('same-text')
		} finally {
			await fixture.dispose()
		}
	})

	it('E11 persists unrelated fields without deriving values', async () => {
		const fixture = await createSluggernautCollection()
		try {
			await expect(
				client.request(createItem(fixture.collection, { notes: 'unrelated' })),
			).resolves.toMatchObject({ notes: 'unrelated', slug: null, permalink: null })
		} finally {
			await fixture.dispose()
		}
	})

	it('E13 leaves derived values and redirect history unchanged for unrelated updates', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Stable' }),
			)
			itemId = String(created.id)
			const before = await readRedirects(fixture.collection, itemId)
			const updated = await client.request(
				updateItem(fixture.collection, created.id, { notes: 'changed' }),
			)
			expect(updated).toMatchObject({ slug: 'stable', permalink: '/articles/stable' })
			expect(await readRedirects(fixture.collection, itemId)).toEqual(before)
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E14 retains the remaining source when one source is cleared', async () => {
		const fixture = await createSluggernautCollection(
			{},
			{ sourceFields: ['title', 'category'] },
		)
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Summer', category: 'News' }),
			)
			itemId = String(created.id)
			await expect(
				client.request(updateItem(fixture.collection, created.id, { title: null })),
			).resolves.toMatchObject({ slug: 'news', permalink: '/articles/news' })
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E15 clears synchronized values when all sources are cleared', async () => {
		const fixture = await createSluggernautCollection(
			{},
			{ sourceFields: ['title', 'category'] },
		)
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Summer', category: 'News' }),
			)
			itemId = String(created.id)
			await expect(
				client.request(
					updateItem(fixture.collection, created.id, { title: null, category: null }),
				),
			).resolves.toMatchObject({ slug: null, permalink: null })
			expect(await readRedirects(fixture.collection, itemId)).toEqual([])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E16 preserves a slug when source updates are disabled but honors an explicit slug', async () => {
		const fixture = await createSluggernautCollection({}, { updateOnSourceChange: false })
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Original' }),
			)
			itemId = String(created.id)
			await expect(
				client.request(updateItem(fixture.collection, created.id, { title: 'Changed' })),
			).resolves.toMatchObject({ slug: 'original' })
			await expect(
				client.request(
					updateItem(fixture.collection, created.id, { slug: ' Manual Slug ' }),
				),
			).resolves.toMatchObject({ slug: 'manual-slug' })
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E17 preserves a manually selected slug through later unrelated updates', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Original', slug: 'Custom Slug' }),
			)
			itemId = String(created.id)
			await expect(
				client.request(
					updateItem(fixture.collection, created.id, { notes: 'later update' }),
				),
			).resolves.toMatchObject({ slug: 'custom-slug', notes: 'later update' })
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E20 accepts an explicit permalink override in generated mode', async () => {
		const fixture = await createSluggernautCollection()
		try {
			await expect(
				client.request(
					createItem(fixture.collection, {
						title: 'Generated Source',
						permalink: '/custom/route',
					}),
				),
			).resolves.toMatchObject({ permalink: '/custom/route' })
		} finally {
			await fixture.dispose()
		}
	})

	it('E22 applies trailing-slash policy independently to generated and manual values', async () => {
		const fixture = await createSluggernautCollection({
			trailingSlash: true,
			enforceTrailingSlashOnManualInput: true,
		})
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Slash Test' }),
			)
			itemId = String(created.id)
			expect(created.permalink).toBe('/articles/slash-test/')
			await expect(
				client.request(
					updateItem(fixture.collection, created.id, { permalink: '/articles/manual' }),
				),
			).resolves.toMatchObject({ permalink: '/articles/manual/' })
			await expect(
				client.request(updateItem(fixture.collection, created.id, { permalink: '/' })),
			).resolves.toMatchObject({ permalink: '/' })
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E23 lets explicit dependent values win over source derivation in one update', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Original' }),
			)
			itemId = String(created.id)
			await expect(
				client.request(
					updateItem(fixture.collection, created.id, {
						title: 'Changed Source',
						slug: ' Explicit Slug ',
						permalink: '/explicit/path',
					}),
				),
			).resolves.toMatchObject({ slug: 'explicit-slug', permalink: '/explicit/path' })
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E24 updates two independent slug and permalink graphs without cross-talk', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'First', category: 'Alpha' }),
			)
			itemId = String(created.id)
			await expect(
				client.request(
					updateItem(fixture.collection, created.id, {
						title: 'Second',
						category: 'Beta',
					}),
				),
			).resolves.toMatchObject({
				slug: 'second',
				permalink: '/articles/second',
				slug_secondary: 'beta',
				permalink_secondary: '/secondary/beta',
			})
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E25 uses existing source values when omitted from an update', async () => {
		const fixture = await createSluggernautCollection(
			{},
			{ sourceFields: ['title', 'category'] },
		)
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Existing', category: 'Category' }),
			)
			itemId = String(created.id)
			await expect(
				client.request(updateItem(fixture.collection, created.id, { category: 'Updated' })),
			).resolves.toMatchObject({ slug: 'existing-updated' })
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E26 rejects invalid path classes atomically', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(createItem(fixture.collection, { title: 'Safe' }))
			itemId = String(created.id)
			const before = await client.request(
				customEndpoint({
					path: `/items/${fixture.collection}/${created.id}`,
					method: 'GET',
				}),
			)
			await expect(
				client.request(
					customEndpoint({
						path: `/items/${fixture.collection}/${created.id}`,
						method: 'PATCH',
						body: JSON.stringify({ permalink: 'https://example.com/unsafe' }),
					}),
				),
			).rejects.toThrow()
			expect(
				await client.request(
					customEndpoint({
						path: `/items/${fixture.collection}/${created.id}`,
						method: 'GET',
					}),
				),
			).toEqual(before)
			expect(await readRedirects(fixture.collection, itemId)).toEqual([])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E28 rejects a malformed bulk create without mis-deriving valid records', async () => {
		const fixture = await createSluggernautCollection()
		try {
			await expect(
				client.request(
					customEndpoint({
						path: `/items/${fixture.collection}`,
						method: 'POST',
						body: JSON.stringify([
							{ title: 'Valid Bulk Item' },
							{ title: 'Malformed Bulk Item', slug: 42 },
						]),
					}),
				),
			).rejects.toThrow()
			expect(
				await client.request(
					readItems(fixture.collection, {
						filter: { title: { _in: ['Valid Bulk Item', 'Malformed Bulk Item'] } },
						fields: ['id', 'title'],
					}),
				),
			).toEqual([])
		} finally {
			await fixture.dispose()
		}
	})

	it('E29 rejects a bulk source update rather than sharing one derived value', async () => {
		const fixture = await createSluggernautCollection()
		try {
			const items = await client.request(
				createItems(fixture.collection, [{ title: 'One' }, { title: 'Two' }]),
			)
			await expect(
				client.request(
					updateItems(
						fixture.collection,
						items.map(({ id }) => id),
						{ title: 'Shared' },
					),
				),
			).rejects.toThrow('ambiguous bulk mutation')
		} finally {
			await fixture.dispose()
		}
	})

	it('E30 rejects an ambiguous bulk update requiring existing-item reads', async () => {
		const fixture = await createSluggernautCollection()
		try {
			const items = await client.request(
				createItems(fixture.collection, [{ title: 'One' }, { title: 'Two' }]),
			)
			await expect(
				client.request(
					customEndpoint({
						path: `/items/${fixture.collection}`,
						method: 'PATCH',
						body: JSON.stringify({
							data: { slug: 'shared' },
							query: { filter: { id: { _in: items.map(({ id }) => id) } } },
						}),
					}),
				),
			).rejects.toThrow('ambiguous bulk mutation')
			expect(items).toHaveLength(2)
		} finally {
			await fixture.dispose()
		}
	})

	it('E31 applies the same authority through REST API and SDK writes', async () => {
		const fixture = await createSluggernautCollection()
		try {
			await expect(
				client.request(
					customEndpoint({
						path: `/items/${fixture.collection}`,
						method: 'POST',
						body: JSON.stringify({ title: 'REST Written Item' }),
					}),
				),
			).resolves.toMatchObject({
				title: 'REST Written Item',
				slug: 'rest-written-item',
				permalink: '/articles/rest-written-item',
			})

			await expect(
				client.request(createItem(fixture.collection, { title: 'SDK Written Item' })),
			).resolves.toMatchObject({
				title: 'SDK Written Item',
				slug: 'sdk-written-item',
				permalink: '/articles/sdk-written-item',
			})
		} finally {
			await fixture.dispose()
		}
	})

	it('E32 makes an identical retry idempotent for the item and redirects', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Retry Start' }),
			)
			itemId = String(created.id)
			const payload = { title: 'Retry Destination' }

			await client.request(updateItem(fixture.collection, created.id, payload))
			await client.request(updateItem(fixture.collection, created.id, payload))

			await expect(
				client.request(
					readItems(fixture.collection, {
						filter: { id: { _eq: created.id } },
						fields: ['id', 'title', 'slug', 'permalink'],
					}),
				),
			).resolves.toEqual([
				expect.objectContaining({
					id: created.id,
					title: 'Retry Destination',
					slug: 'retry-destination',
					permalink: '/articles/retry-destination',
				}),
			])
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([
				expect.objectContaining({
					origin: '/articles/retry-start',
					destination: '/articles/retry-destination',
					is_active: true,
				}),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E33 exposes a failed derived-field write without reporting a false success', async () => {
		const fixture = await createSluggernautCollection({}, {}, { slugSchema: { max_length: 3 } })
		try {
			await expect(
				client.request(createItem(fixture.collection, { title: 'Too Long For Slug' })),
			).rejects.toThrow()
			await expect(
				client.request(
					readItems(fixture.collection, {
						filter: { title: { _eq: 'Too Long For Slug' } },
					}),
				),
			).resolves.toEqual([])
		} finally {
			await fixture.dispose()
		}
	})

	it.skip('E34 leaves a consistent item and redirect state after concurrent updates', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Concurrent Start' }),
			)
			itemId = String(created.id)
			await Promise.all([
				client.request(
					updateItem(fixture.collection, created.id, { title: 'Concurrent Alpha' }),
				),
				client.request(
					updateItem(fixture.collection, created.id, { title: 'Concurrent Beta' }),
				),
			])

			const [item] = await client.request(
				readItems(fixture.collection, {
					filter: { id: { _eq: created.id } },
					fields: ['title', 'slug', 'permalink'],
				}),
			)
			expect(item).toBeDefined()
			expect(item?.title).toMatch(/^Concurrent (Alpha|Beta)$/u)
			expect(item?.slug).toBe(String(item?.title).toLocaleLowerCase().replaceAll(' ', '-'))
			expect(item?.permalink).toBe(`/articles/${item?.slug}`)

			const redirects = await readRedirects(fixture.collection, itemId)
			expect(redirects.filter(({ is_active }) => is_active)).toEqual([
				expect.objectContaining({ destination: item?.permalink }),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E43 derives values without redirect history when automatic redirects are disabled', async () => {
		const fixture = await createSluggernautCollection({ automaticRedirects: false })
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'No Redirects' }),
			)
			itemId = String(created.id)
			await client.request(
				updateItem(fixture.collection, created.id, { title: 'Still No Redirects' }),
			)
			expect(created).toMatchObject({
				slug: 'no-redirects',
				permalink: '/articles/no-redirects',
			})
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E44 creates one canonical redirect from an automatic slug', async () => {
		const fixture = await createSluggernautCollection(
			{ automaticRedirects: false },
			{ automaticRedirects: true },
		)
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Canonical Old' }),
			)
			itemId = String(created.id)
			await client.request(
				updateItem(fixture.collection, created.id, { title: 'Canonical New' }),
			)
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([
				expect.objectContaining({
					origin: '/canonical-old',
					destination: '/canonical-new',
					source_field: 'slug',
				}),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E45 gives automatic permalink history precedence over automatic slug history', async () => {
		const fixture = await createSluggernautCollection({}, { automaticRedirects: true })
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Precedence Old' }),
			)
			itemId = String(created.id)
			await client.request(
				updateItem(fixture.collection, created.id, { title: 'Precedence New' }),
			)
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([
				expect.objectContaining({
					origin: '/articles/precedence-old',
					destination: '/articles/precedence-new',
					source_field: 'permalink',
				}),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E46 uses the first discovered enabled permalink as the redirect source', async () => {
		const fixture = await createSluggernautCollection(
			{ automaticRedirects: false },
			{},
			{ includePrimarySlug: false },
		)
		let itemId: string | undefined
		try {
			await client.request(
				createField(fixture.collection, {
					field: 'permalink_later',
					type: 'string',
					meta: {
						interface: 'sluggernaut-permalink',
						options: {
							...permalinkOptions,
							automaticRedirects: true,
							prefix: '/later',
						},
					},
					schema: { is_nullable: true },
				}),
			)
			const created = await client.request(
				createItem(fixture.collection, { title: 'Later Old' }),
			)
			itemId = String(created.id)
			await client.request(updateItem(fixture.collection, created.id, { title: 'Later New' }))
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([
				expect.objectContaining({ source_field: 'permalink_later' }),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E47 rewrites one canonical transition with complete provenance', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Old Canonical' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'New Canonical' }),
			)
			const [redirect] = await readRedirects(fixture.collection, itemId)
			expect(redirect).toMatchObject({
				origin: '/articles/old-canonical',
				destination: '/articles/new-canonical',
				managed_by: 'sluggernaut',
				source_collection: fixture.collection,
				source_item: itemId,
				source_field: 'permalink',
			})
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E48 does not plan history when the canonical value is unchanged or unavailable', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Stable Canonical' }),
			)
			itemId = String(item.id)
			await client.request(updateItem(fixture.collection, item.id, { notes: 'unrelated' }))
			await client.request(updateItem(fixture.collection, item.id, { title: '--- !!!' }))
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E49 flattens a canonical reversion without creating an active self-loop', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Revert Old' }),
			)
			itemId = String(item.id)
			await client.request(updateItem(fixture.collection, item.id, { title: 'Revert New' }))
			await client.request(updateItem(fixture.collection, item.id, { title: 'Revert Old' }))
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(
				redirects.every(
					({ is_active, origin, destination }) => !is_active || origin !== destination,
				),
			).toBe(true)
			expect(redirects.filter(({ is_active }) => is_active)).toHaveLength(0)
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E50 makes sequential canonical changes converge on the latest destination', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Quick One' }),
			)
			itemId = String(item.id)
			await client.request(updateItem(fixture.collection, item.id, { title: 'Quick Two' }))
			await client.request(updateItem(fixture.collection, item.id, { title: 'Quick Three' }))
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(redirects.filter(({ is_active }) => is_active)).toEqual([
				expect.objectContaining({ destination: '/articles/quick-three' }),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E51 rewrites an existing managed redirect instead of duplicating it', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Managed Old' }),
			)
			itemId = String(item.id)
			const seeded = await createRedirect({
				origin: '/articles/managed-old',
				destination: '/articles/stale',
				source_item: itemId,
			})
			seededId = seeded.id
			await client.request(updateItem(fixture.collection, item.id, { title: 'Managed New' }))
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(
				redirects.filter(({ origin }) => origin === '/articles/managed-old'),
			).toHaveLength(1)
			expect(
				redirects.find(({ origin }) => origin === '/articles/managed-old'),
			).toMatchObject({
				destination: '/articles/managed-new',
			})
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E52 does not claim matching URL history owned by another source', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Foreign Old' }),
			)
			itemId = String(item.id)
			const seeded = await createRedirect({
				origin: '/articles/foreign-old',
				destination: '/articles/foreign-destination',
				source_collection: 'other_collection',
				source_item: 'other-item',
			})
			seededId = seeded.id
			await client.request(updateItem(fixture.collection, item.id, { title: 'Foreign New' }))
			await expect(
				client.request(readItems('redirects', { filter: { id: { _eq: seededId } } })),
			).resolves.toEqual([
				expect.objectContaining({
					destination: '/articles/foreign-new',
					source_collection: 'other_collection',
					source_item: 'other-item',
				}),
			])
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E53 uses the configured redirect collection used by the running environment', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Configured Redirects' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Configured Destination' }),
			)
			await expect(readRedirects(fixture.collection, itemId)).resolves.toHaveLength(1)
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E54 keeps derivation usable when redirect history is unavailable to the item flow', async () => {
		const fixture = await createSluggernautCollection({ automaticRedirects: false })
		try {
			await expect(
				client.request(createItem(fixture.collection, { title: 'Derivation Only' })),
			).resolves.toMatchObject({
				slug: 'derivation-only',
				permalink: '/articles/derivation-only',
			})
		} finally {
			await fixture.dispose()
		}
	})

	it('E55 flattens an existing managed redirect chain', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		const seededIds: string[] = []
		try {
			const item = await client.request(createItem(fixture.collection, { title: 'Chain B' }))
			itemId = String(item.id)
			for (const values of [
				{ origin: '/articles/chain-a', destination: '/articles/chain-b' },
				{
					origin: '/articles/chain-b',
					destination: '/articles/chain-c',
					source_item: itemId,
				},
			]) {
				seededIds.push((await createRedirect(values)).id)
			}
			await client.request(updateItem(fixture.collection, item.id, { title: 'Chain D' }))
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(
				redirects
					.filter(({ is_active }) => is_active)
					.every(({ destination }) => destination === '/articles/chain-d'),
			).toBe(true)
		} finally {
			for (const id of seededIds)
				await client.request(deleteItem('redirects', id)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E56 deactivates an existing redirect originating at the new canonical URL', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(createItem(fixture.collection, { title: 'Loop Old' }))
			itemId = String(item.id)
			seededId = (
				await createRedirect({
					origin: '/articles/loop-new',
					destination: '/articles/elsewhere',
				})
			).id
			await client.request(updateItem(fixture.collection, item.id, { title: 'Loop New' }))
			await expect(
				client.request(readItems('redirects', { filter: { id: { _eq: seededId } } })),
			).resolves.toEqual([expect.objectContaining({ is_active: false })])
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E57 overrides an unmanaged old-origin conflict without deleting it', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Conflict Old' }),
			)
			itemId = String(item.id)
			seededId = (
				await createRedirect({
					origin: '/articles/conflict-old',
					destination: '/manual-destination',
					managed_by: null,
					source_collection: null,
					source_item: null,
					source_field: null,
					source_type: null,
				})
			).id
			await client.request(updateItem(fixture.collection, item.id, { title: 'Conflict New' }))
			await expect(
				client.request(readItems('redirects', { filter: { id: { _eq: seededId } } })),
			).resolves.toEqual([
				expect.objectContaining({
					destination: '/articles/conflict-new',
					managed_by: null,
				}),
			])
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E58 blocks an unmanaged old-origin conflict when configured to block', async () => {
		const fixture = await createSluggernautCollection({
			unmanagedRedirectConflictBehavior: 'block',
		})
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Blocked Old' }),
			)
			itemId = String(item.id)
			seededId = (
				await createRedirect({
					origin: '/articles/blocked-old',
					destination: '/manual-destination',
					managed_by: null,
					source_collection: null,
					source_item: null,
					source_field: null,
					source_type: null,
				})
			).id
			await client.request(updateItem(fixture.collection, item.id, { title: 'Blocked New' }))
			await expect(
				client.request(readItems('redirects', { filter: { id: { _eq: seededId } } })),
			).resolves.toEqual([
				expect.objectContaining({ destination: '/manual-destination', managed_by: null }),
			])
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E59 excludes unmanaged records from planning when configured', async () => {
		const fixture = await createSluggernautCollection({
			includeUnmanagedRedirectsInPlanning: false,
		})
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Unmanaged Old' }),
			)
			itemId = String(item.id)
			seededId = (
				await createRedirect({
					origin: '/articles/unmanaged-old',
					destination: '/manual-destination',
					managed_by: null,
					source_collection: null,
					source_item: null,
					source_field: null,
					source_type: null,
				})
			).id
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Unmanaged New' }),
			)
			const unmanagedRedirects = await client.request(
				readItems('redirects', { filter: { id: { _eq: seededId } } }),
			)
			const managedRedirects = await readRedirects(fixture.collection, itemId)
			expect(unmanagedRedirects).toEqual([
				expect.objectContaining({ managed_by: null, destination: '/manual-destination' }),
			])
			expect(managedRedirects).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						managed_by: 'sluggernaut',
						destination: '/articles/unmanaged-new',
					}),
				]),
			)
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E60 preserves a manual redirect with a different origin and destination', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Manual Destination' }),
			)
			itemId = String(item.id)
			seededId = (
				await createRedirect({
					origin: '/manual-origin',
					destination: '/articles/manual-destination',
					managed_by: null,
					source_collection: null,
					source_item: null,
					source_field: null,
					source_type: null,
				})
			).id
			await client.request(
				updateItem(fixture.collection, item.id, { notes: 'no canonical change' }),
			)
			await expect(
				client.request(readItems('redirects', { filter: { id: { _eq: seededId } } })),
			).resolves.toEqual([
				expect.objectContaining({
					origin: '/manual-origin',
					destination: '/articles/manual-destination',
				}),
			])
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E61 ignores malformed redirect types while valid history remains readable', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		let malformedId: string | undefined
		try {
			malformedId = String(
				(
					await client.request(
						createItem('redirects', {
							origin: '/articles/malformed',
							destination: '/articles/malformed-destination',
							type: 999,
						}),
					)
				).id,
			)
			const item = await client.request(
				createItem(fixture.collection, { title: 'Malformed History Old' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Malformed History New' }),
			)
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([
				expect.objectContaining({ destination: '/articles/malformed-history-new' }),
			])
		} finally {
			if (malformedId)
				await client.request(deleteItem('redirects', malformedId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E62 does not amplify pre-seeded duplicate active managed origins', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		const seededIds: string[] = []
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Duplicate Origin' }),
			)
			itemId = String(item.id)
			for (let index = 0; index < 2; index++)
				seededIds.push(
					(
						await createRedirect({
							origin: '/articles/duplicate-origin',
							source_item: itemId,
						})
					).id,
				)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Duplicate Destination' }),
			)
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(
				redirects.filter(({ origin }) => origin === '/articles/duplicate-origin'),
			).toHaveLength(2)
		} finally {
			for (const id of seededIds)
				await client.request(deleteItem('redirects', id)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E63 requires redirect provenance rather than URL ownership alone', async () => {
		const fixture = await createSluggernautCollection({
			unmanagedRedirectConflictBehavior: 'block',
		})
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Impersonation Old' }),
			)
			itemId = String(item.id)
			seededId = (
				await createRedirect({
					origin: '/articles/impersonation-old',
					destination: '/protected',
					managed_by: null,
					source_collection: null,
					source_item: null,
					source_field: null,
					source_type: null,
				})
			).id
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Impersonation New' }),
			)
			await expect(
				client.request(readItems('redirects', { filter: { id: { _eq: seededId } } })),
			).resolves.toEqual([
				expect.objectContaining({ destination: '/protected', managed_by: null }),
			])
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E64 deactivates self-loop redirects after canonical normalization', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Self Loop Old' }),
			)
			itemId = String(item.id)
			seededId = (
				await createRedirect({
					origin: '/articles/self-loop-new',
					destination: '/articles/self-loop-new',
				})
			).id
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Self Loop New' }),
			)
			await expect(
				client.request(readItems('redirects', { filter: { id: { _eq: seededId } } })),
			).resolves.toEqual([expect.objectContaining({ is_active: false })])
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E65 preserves scheduled redirect dates during canonical planning', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		let seededId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Scheduled Old' }),
			)
			itemId = String(item.id)
			seededId = (
				await createRedirect({
					origin: '/articles/scheduled-old',
					destination: '/articles/stale',
					start_date: '2026-01-01T00:00:00.000Z',
					end_date: '2027-01-01T00:00:00.000Z',
					source_item: itemId,
				})
			).id
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Scheduled New' }),
			)
			await expect(
				client.request(
					readItems('redirects', {
						filter: { id: { _eq: seededId } },
						fields: ['destination', 'start_date', 'end_date'],
					}),
				),
			).resolves.toEqual([
				expect.objectContaining({
					destination: '/articles/scheduled-new',
					start_date: '2026-01-01T00:00:00.000Z',
					end_date: '2027-01-01T00:00:00.000Z',
				}),
			])
		} finally {
			if (seededId)
				await client.request(deleteItem('redirects', seededId)).catch(() => undefined)
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E66 deactivates all active managed history when an item is archived', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Archive Active' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Archive Changed' }),
			)
			await client.request(updateItem(fixture.collection, item.id, { status: 'archived' }))
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(
				redirects.every(
					({ is_active, inactive_reason }) => !is_active && inactive_reason === 'archive',
				),
			).toBe(true)
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E67 reactivates only archive-suspended history after unarchive', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Unarchive Item' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Unarchive Changed' }),
			)
			await client.request(updateItem(fixture.collection, item.id, { status: 'archived' }))
			await client.request(updateItem(fixture.collection, item.id, { status: 'published' }))
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(redirects.filter(({ is_active }) => is_active).length).toBeGreaterThan(0)
			expect(
				redirects.every(
					({ inactive_reason }) =>
						inactive_reason === null || inactive_reason === 'archive',
				),
			).toBe(true)
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E68 preserves auditable delete provenance for managed history', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Delete Item' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Delete Changed' }),
			)
			await client.request(deleteItem(fixture.collection, item.id))
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([
				expect.objectContaining({
					is_active: false,
					inactive_reason: 'delete',
					source_item: itemId,
				}),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E69 succeeds when archive/delete lifecycle has no managed history', async () => {
		const fixture = await createSluggernautCollection({ automaticRedirects: false })
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'No History Lifecycle' }),
			)
			itemId = String(item.id)
			await expect(
				client.request(updateItem(fixture.collection, item.id, { status: 'archived' })),
			).resolves.toMatchObject({ status: 'archived' })
			await expect(
				client.request(updateItem(fixture.collection, item.id, { status: 'published' })),
			).resolves.toMatchObject({ status: 'published' })
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E70 keeps archive lifecycle and canonical history consistent across a supported sequence', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Lifecycle Old' }),
			)
			itemId = String(item.id)
			await client.request(updateItem(fixture.collection, item.id, { status: 'archived' }))
			await client.request(
				updateItem(fixture.collection, item.id, {
					status: 'published',
					title: 'Lifecycle New',
				}),
			)
			const [stored] = await client.request(
				readItems(fixture.collection, {
					filter: { id: { _eq: item.id } },
					fields: ['status', 'slug', 'permalink'],
				}),
			)
			expect(stored).toMatchObject({
				status: 'published',
				slug: 'lifecycle-new',
				permalink: '/articles/lifecycle-new',
			})
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(
				redirects.every(
					({ is_active, origin, destination }) => !is_active || origin !== destination,
				),
			).toBe(true)
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E71 does not accidentally reactivate a manually overridden inactive redirect', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Manual Override' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Manual Override Changed' }),
			)
			const [redirect] = await readRedirects(fixture.collection, itemId)
			if (redirect === undefined) throw new Error('Expected managed redirect history')
			await client.request(updateItem('redirects', redirect.id, { is_active: false }))
			await client.request(updateItem(fixture.collection, item.id, { status: 'archived' }))
			await client.request(updateItem(fixture.collection, item.id, { status: 'published' }))
			await expect(
				client.request(readItems('redirects', { filter: { id: { _eq: redirect.id } } })),
			).resolves.toEqual([expect.objectContaining({ is_active: false })])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E72 does not treat status fields as lifecycle metadata without archive configuration', async () => {
		const fixture = await createSluggernautCollection({}, {}, { archiveMetadata: false })
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Custom Status' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Custom Status Changed' }),
			)
			await client.request(updateItem(fixture.collection, item.id, { status: 'archived' }))
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(redirects.some(({ is_active }) => is_active)).toBe(true)
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E73 keeps repeated archive/delete lifecycle events idempotent', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Repeated Lifecycle' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Repeated Changed' }),
			)
			await client.request(updateItem(fixture.collection, item.id, { status: 'archived' }))
			await client.request(updateItem(fixture.collection, item.id, { status: 'archived' }))
			await client.request(updateItem(fixture.collection, item.id, { status: 'published' }))
			await client.request(updateItem(fixture.collection, item.id, { status: 'published' }))
			const redirects = await readRedirects(fixture.collection, itemId)
			expect(redirects.filter(({ is_active }) => is_active).length).toBeGreaterThan(0)
			await client.request(deleteItem(fixture.collection, item.id))
			await client.request(deleteItem(fixture.collection, item.id)).catch(() => undefined)
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([
				expect.objectContaining({ is_active: false, inactive_reason: 'delete' }),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E35 normalizes equivalent generated prefixes and rejects URL prefixes', async () => {
		for (const prefix of [undefined, '/news', 'news', '/news/']) {
			const fixture = await createSluggernautCollection({ prefix })
			try {
				const item = await client.request(
					createItem(fixture.collection, { title: 'Prefix Item' }),
				)
				expect(item.permalink).toBe(
					prefix === undefined ? '/prefix-item' : '/news/prefix-item',
				)
			} finally {
				await fixture.dispose()
			}
		}

		const fixture = await createSluggernautCollection({ prefix: 'https://example.com/news' })
		try {
			await expect(
				client.request(createItem(fixture.collection, { title: 'Invalid Prefix' })),
			).rejects.toThrow()
		} finally {
			await fixture.dispose()
		}
	})

	it('E36 represents an empty generated slug as the configured root', async () => {
		const fixture = await createSluggernautCollection({ prefix: '/news' })
		try {
			await expect(
				client.request(createItem(fixture.collection, { title: '--- ... !!!' })),
			).resolves.toMatchObject({ slug: null, permalink: null })
		} finally {
			await fixture.dispose()
		}
	})

	it('E37 normalizes valid manual paths according to the configured slash policy', async () => {
		const fixture = await createSluggernautCollection({
			enforceTrailingSlashOnManualInput: true,
			trailingSlash: true,
		})
		try {
			for (const [input, expected] of [
				['/', '/'],
				['/a//b', '/a/b/'],
				['/a/b/', '/a/b/'],
				['/nested/path/item', '/nested/path/item/'],
			] as const) {
				await expect(
					client.request(
						createItem(fixture.collection, {
							title: `Manual ${input}`,
							permalink: input,
						}),
					),
				).resolves.toMatchObject({ permalink: expected })
			}
		} finally {
			await fixture.dispose()
		}
	})

	it('E38 rejects unsafe manual path classes without changing an existing item', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Safe Path', permalink: '/safe/path' }),
			)
			itemId = String(created.id)
			for (const invalid of [
				'https://example.com/path',
				'//example.com/path',
				'/path?query=1',
				'/path#fragment',
				'/path\\segment',
				'/path/./segment',
				'/path/../segment',
				'/path with whitespace',
				'/path\u0001segment',
			]) {
				await expect(
					client.request(
						updateItem(fixture.collection, created.id, { permalink: invalid }),
					),
				).rejects.toThrow()
			}
			await expect(
				client.request(
					readItems(fixture.collection, {
						filter: { id: { _eq: created.id } },
						fields: ['title', 'slug', 'permalink'],
					}),
				),
			).resolves.toEqual([
				expect.objectContaining({ title: 'Safe Path', permalink: '/safe/path' }),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E39 enforces prefix boundaries without accepting lookalike paths', async () => {
		const fixture = await createSluggernautCollection({
			prefix: '/news',
			validatePrefixOnManualInput: true,
		})
		try {
			await expect(
				client.request(
					createItem(fixture.collection, {
						title: 'Valid Boundary',
						permalink: '/news/item',
					}),
				),
			).resolves.toMatchObject({ permalink: '/news/item' })
			await expect(
				client.request(
					createItem(fixture.collection, {
						title: 'Invalid Boundary',
						permalink: '/newspaper/item',
					}),
				),
			).rejects.toThrow('outside the configured prefix')
		} finally {
			await fixture.dispose()
		}
	})

	it('E40 excludes malformed permalink and slug references while valid fields continue', async () => {
		const fixture = await createSluggernautCollection()
		try {
			await client.request(
				createField(fixture.collection, {
					field: 'slug_malformed',
					type: 'string',
					meta: { interface: 'sluggernaut-slug', options: { sourceFields: 'title' } },
					schema: { is_nullable: true },
				}),
			)
			for (const [field, slugField] of [
				['permalink_missing', 'missing_slug'],
				['permalink_cross_collection', 'other_collection.slug'],
				['permalink_non_slug', 'title'],
			] as const) {
				await client.request(
					createField(fixture.collection, {
						field,
						type: 'string',
						meta: {
							interface: 'sluggernaut-permalink',
							options: { ...permalinkOptions, slugField },
						},
						schema: { is_nullable: true },
					}),
				)
			}
			await expect(
				client.request(
					createItem(fixture.collection, { title: 'Valid Configuration Survives' }),
				),
			).resolves.toMatchObject({
				slug: 'valid-configuration-survives',
				permalink: '/articles/valid-configuration-survives',
			})
		} finally {
			await fixture.dispose()
		}
	})

	it('E41 supports a standalone permalink without acquiring an implicit slug dependency', async () => {
		const fixture = await createSluggernautCollection(
			{ generateFromSlug: false, slugField: undefined, prefix: undefined },
			{},
			{ includePrimarySlug: false },
		)
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, {
					title: 'Standalone',
					permalink: '/standalone/path',
				}),
			)
			itemId = String(created.id)
			expect(created).not.toHaveProperty('slug')
			await expect(
				client.request(
					updateItem(fixture.collection, created.id, {
						permalink: '/standalone/updated',
					}),
				),
			).resolves.toMatchObject({ permalink: '/standalone/updated' })
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('E42 keeps two generated permalinks isolated by their selected slugs', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, {
					title: 'Primary Title',
					category: 'Secondary Category',
				}),
			)
			itemId = String(created.id)
			expect(created).toMatchObject({
				slug: 'primary-title',
				permalink: '/articles/primary-title',
				slug_secondary: 'secondary-category',
				permalink_secondary: '/secondary/secondary-category',
			})

			const titleUpdate = await client.request(
				updateItem(fixture.collection, created.id, { title: 'Updated Primary Title' }),
			)
			expect(titleUpdate).toMatchObject({
				slug: 'updated-primary-title',
				permalink: '/articles/updated-primary-title',
				slug_secondary: 'secondary-category',
				permalink_secondary: '/secondary/secondary-category',
			})

			await expect(
				client.request(
					updateItem(fixture.collection, created.id, {
						category: 'Updated Secondary Category',
					}),
				),
			).resolves.toMatchObject({
				permalink: '/articles/updated-primary-title',
				slug_secondary: 'updated-secondary-category',
				permalink_secondary: '/secondary/updated-secondary-category',
			})
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})
})
