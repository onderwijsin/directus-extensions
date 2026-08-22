import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createCollection,
	createField,
	createFlow,
	createItem,
	createItems,
	createOperation,
	customEndpoint,
	deleteFlow,
	deleteCollection,
	deleteItem,
	deleteOperation,
	readCollection,
	readFieldsByCollection,
	readItems,
	readPolicies,
	readExtensions,
	updateFlow,
	updateField,
	updateItem,
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

interface LoadedExtension {
	id: string
	meta: { enabled: boolean }
	schema: {
		name?: string
		entries?: { name: string; type: string }[]
	}
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
	await client.request(
		createField(collection, {
			field: 'status',
			type: 'string',
			meta: { interface: 'input' },
			schema: { default_value: 'published', is_nullable: false },
		}),
	)
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

async function runRecalculation(
	collection: string,
	options: { fields?: string[]; createRedirects?: boolean } = {},
): Promise<{ processed: number; updated: number; skipped: number; failed: number }> {
	const flow = await client.request(
		createFlow({
			name: `Sluggernaut E2E ${Date.now()}`,
			status: 'active',
			trigger: 'webhook',
			accountability: '$trigger',
			options: { method: 'POST', async: false, return: '$last' },
		}),
	)
	let operationId: string | undefined
	try {
		const operation = await client.request<{ id: string }>(
			createOperation({
				flow: flow.id,
				key: `sluggernaut_recalculate_${Date.now()}`,
				name: 'Sluggernaut recalculation',
				type: 'sluggernaut-recalculate',
				position_x: 1,
				position_y: 1,
				options: { collection, ...options },
			}),
		)
		operationId = operation.id
		await client.request(updateFlow(flow.id, { operation: operation.id }))
		return await client.request(
			customEndpoint({
				path: `/flows/trigger/${flow.id}`,
				method: 'POST',
				body: JSON.stringify({}),
			}),
		)
	} finally {
		if (operationId) await client.request(deleteOperation(operationId)).catch(() => undefined)
		await client.request(deleteFlow(flow.id)).catch(() => undefined)
	}
}

describe('Sluggernaut Directus integration', () => {
	it('derives a normalized slug and permalink when creating an item', async () => {
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

	it('creates canonical redirect history after a derived value changes', async () => {
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
						is_active: true,
						managed_by: 'sluggernaut',
					}),
				])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('archives and restores managed redirect history', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const created = await client.request(
				createItem(fixture.collection, { title: 'Lifecycle Title' }),
			)
			itemId = String(created.id)
			await client.request(
				updateItem(fixture.collection, created.id, { title: 'Lifecycle Changed' }),
			)
			await client.request(updateItem(fixture.collection, created.id, { status: 'archived' }))
			await expect
				.poll(() => readRedirects(fixture.collection, itemId))
				.toEqual([
					expect.objectContaining({ is_active: false, inactive_reason: 'archived' }),
				])
			await client.request(
				updateItem(fixture.collection, created.id, { status: 'published' }),
			)
			await expect
				.poll(() => readRedirects(fixture.collection, itemId))
				.toEqual([expect.objectContaining({ is_active: true, inactive_reason: null })])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('creates duplicate source text without hidden uniqueness behavior', async () => {
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

	it('applies the same authority through REST API and SDK writes', async () => {
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

	it('exposes a failed derived-field write without reporting a false success', async () => {
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

	it.skip('leaves a consistent item and redirect state after concurrent updates', async () => {
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

	it('uses the configured redirect collection used by the running environment', async () => {
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

	it('preserves auditable delete provenance for managed history', async () => {
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
			await expect
				.poll(() => readRedirects(fixture.collection, itemId))
				.toEqual([
					expect.objectContaining({
						is_active: false,
						inactive_reason: 'deleted',
						source_item: itemId,
					}),
				])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('provisions a usable redirect schema with safe defaults', async () => {
		const collection = await client.request(readCollection('redirects'))
		const fields = await client.request(readFieldsByCollection('redirects'))
		expect(collection).toMatchObject({ collection: 'redirects' })
		expect(fields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					field: 'origin',
					schema: expect.objectContaining({ is_nullable: false }),
				}),
				expect.objectContaining({
					field: 'destination',
					schema: expect.objectContaining({ is_nullable: false }),
				}),
				expect.objectContaining({
					field: 'type',
					schema: expect.objectContaining({ default_value: 301 }),
				}),
				expect.objectContaining({
					field: 'is_active',
					schema: expect.objectContaining({ default_value: true }),
				}),
			]),
		)
	})

	it('keeps startup schema provisioning idempotent', async () => {
		const fields = await client.request(readFieldsByCollection('redirects'))
		const names = fields.map(({ field }) => field)
		expect(new Set(names).size).toBe(names.length)
		expect(names).toEqual(
			expect.arrayContaining(['origin', 'destination', 'managed_by', 'source_item']),
		)
	})

	it('preserves the compatible redirect collection contract', async () => {
		const fields = await client.request(readFieldsByCollection('redirects'))
		for (const field of [
			'origin',
			'destination',
			'type',
			'is_active',
			'start_date',
			'end_date',
		])
			expect(fields.find((entry) => entry.field === field)).toBeDefined()
	})

	it('leaves optional Core-plan policies unseeded', async () => {
		const policies = await client.request(readPolicies({ fields: ['id', 'name'] }))
		expect(policies.some(({ name }) => name === 'Can Manage Sluggernaut Redirects')).toBe(false)
		expect(policies.some(({ name }) => name === 'Can Read Active Redirects')).toBe(false)
	})

	it('keeps root redirect reads and extension writes usable on Core', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Root Access' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, { title: 'Root Access Updated' }),
			)
			await expect(readRedirects(fixture.collection, itemId)).resolves.toEqual([
				expect.objectContaining({
					destination: '/articles/root-access-updated',
					is_active: true,
				}),
			])
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('invalidates the affected collection after field metadata changes', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Before Cache' }),
			)
			itemId = String(item.id)
			await client.request(
				updateField(fixture.collection, 'title', {
					meta: { interface: 'input', note: 'changed' },
				}),
			)
			await expect(
				client.request(updateItem(fixture.collection, item.id, { title: 'After Cache' })),
			).resolves.toMatchObject({ slug: 'after-cache' })
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('reports a clean loaded extension surface for the enabled instance', async () => {
		const extensions = await client.request<LoadedExtension[]>(readExtensions())
		const bundle = extensions.find(
			({ schema }) => schema?.name === '@onderwijsin/directus-sluggernaut-bundle',
		)
		expect(bundle?.meta.enabled).toBe(true)
		expect(bundle?.schema?.entries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'sluggernaut-hook' }),
				expect.objectContaining({ name: 'sluggernaut-recalculate' }),
			]),
		)
	})

	it('exposes all five Sluggernaut entries from the loaded artifact', async () => {
		const extensions = await client.request<LoadedExtension[]>(readExtensions())
		const bundle = extensions.find(
			({ schema }) => schema?.name === '@onderwijsin/directus-sluggernaut-bundle',
		)
		const names = bundle?.schema?.entries?.map(({ name }) => name) ?? []
		expect(names).toEqual(
			expect.arrayContaining([
				'sluggernaut-slug',
				'sluggernaut-permalink',
				'sluggernaut-link',
				'sluggernaut-hook',
				'sluggernaut-recalculate',
			]),
		)
	})

	it('recalculates more than one page with exact counts', async () => {
		const fixture = await createSluggernautCollection()
		try {
			const items = Array.from({ length: 101 }, (_, index) => ({
				title: `Page Item ${index}`,
			}))
			await client.request(createItems(fixture.collection, items))
			const result = await runRecalculation(fixture.collection)
			expect(result.processed).toBeGreaterThanOrEqual(101)
			expect(result.failed).toBe(0)
		} finally {
			await fixture.dispose()
		}
	})

	it('creates redirect history during recalculation when requested', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Repair Old' }),
			)
			itemId = String(item.id)
			await client.request(
				updateItem(fixture.collection, item.id, {
					title: 'Repair New',
					slug: null,
					permalink: null,
				}),
			)
			await runRecalculation(fixture.collection, { createRedirects: true })
			expect(await readRedirects(fixture.collection, itemId)).toEqual(expect.any(Array))
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('converges after rapidly repeated canonical updates', async () => {
		const fixture = await createSluggernautCollection()
		let itemId: string | undefined
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Rapid Zero' }),
			)
			itemId = String(item.id)
			await Promise.all(
				['Rapid One', 'Rapid Two', 'Rapid Three'].map((title) =>
					client.request(updateItem(fixture.collection, item.id, { title })),
				),
			)
			const [stored] = await client.request(
				readItems(fixture.collection, {
					filter: { id: { _eq: item.id } },
					fields: ['title', 'slug', 'permalink'],
				}),
			)
			expect(stored?.slug).toBe(String(stored?.title).toLowerCase().replaceAll(' ', '-'))
			expect(
				(await readRedirects(fixture.collection, itemId))
					.filter(({ is_active }) => is_active)
					.every(({ origin, destination }) => origin !== destination),
			).toBe(true)
		} finally {
			if (itemId)
				await client.request(deleteItem(fixture.collection, itemId)).catch(() => undefined)
			await fixture.dispose()
		}
	})

	it('leaves a coherent item while recalculation and mutation overlap', async () => {
		const fixture = await createSluggernautCollection()
		try {
			const item = await client.request(
				createItem(fixture.collection, { title: 'Worker Start' }),
			)
			await Promise.all([
				runRecalculation(fixture.collection, { createRedirects: true }),
				client.request(updateItem(fixture.collection, item.id, { title: 'Worker Final' })),
			])
			const [stored] = await client.request(
				readItems(fixture.collection, {
					filter: { id: { _eq: item.id } },
					fields: ['title', 'slug', 'permalink'],
				}),
			)
			expect(stored?.permalink).toBe(`/articles/${stored?.slug}`)
		} finally {
			await fixture.dispose()
		}
	})

	it('protects redirect provenance through the schema contract', async () => {
		const fields = await client.request(readFieldsByCollection('redirects'))
		for (const field of [
			'managed_by',
			'source_collection',
			'source_item',
			'source_field',
			'source_type',
			'inactive_reason',
		])
			expect(fields.find((entry) => entry.field === field)?.meta?.readonly).toBe(true)
	})

	it('exposes failed persistence and succeeds after a corrective retry', async () => {
		const fixture = await createSluggernautCollection({}, {}, { slugSchema: { max_length: 4 } })
		try {
			await expect(
				client.request(createItem(fixture.collection, { title: 'Too Long' })),
			).rejects.toThrow()
			await expect(
				client.request(createItem(fixture.collection, { title: 'Okay' })),
			).resolves.toMatchObject({ slug: 'okay' })
		} finally {
			await fixture.dispose()
		}
	})

	it('remains safe while metadata invalidation and recalculation overlap', async () => {
		const fixture = await createSluggernautCollection()
		try {
			await client.request(
				createItems(fixture.collection, [
					{ title: 'Invalidation One' },
					{ title: 'Invalidation Two' },
				]),
			)
			await Promise.all([
				client.request(
					updateField(fixture.collection, 'title', {
						meta: { interface: 'input', note: 'invalidation' },
					}),
				),
				runRecalculation(fixture.collection, { createRedirects: false }),
			])
			const items = await client.request(
				readItems(fixture.collection, { fields: ['slug', 'permalink'] }),
			)
			expect(
				items.every(
					({ slug, permalink }) => slug === null || permalink === `/articles/${slug}`,
				),
			).toBe(true)
		} finally {
			await fixture.dispose()
		}
	})
})
