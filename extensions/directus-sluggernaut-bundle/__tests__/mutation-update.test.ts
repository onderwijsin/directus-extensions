import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	readExistingItem: vi.fn(),
	coordinateMutation: vi.fn(),
	processArchiveLifecycle: vi.fn(),
	processCanonicalRedirect: vi.fn(),
}))

vi.mock('../src/sluggernaut-hook/mutation/items', () => ({
	readExistingItem: mocks.readExistingItem,
	relevantFields: vi.fn(() => ['title', 'slug', 'route']),
}))
vi.mock('../src/sluggernaut-hook/mutation/coordinator', () => ({
	coordinateMutation: mocks.coordinateMutation,
}))
vi.mock('../src/sluggernaut-hook/redirects/history/lifecycle', () => ({
	processArchiveLifecycle: mocks.processArchiveLifecycle,
}))
vi.mock('../src/sluggernaut-hook/redirects/history/canonical', () => ({
	processCanonicalRedirect: mocks.processCanonicalRedirect,
}))

import { processItemUpdate } from '../src/sluggernaut-hook/mutation/update'

const configuration = { slugs: [], permalinks: [], warnings: [] } as never
const options = { SLUGGERNAUT_REDIRECTS_ENABLED: true } as never
const context = {} as never
const database = vi.fn()
const eventContext = { schema: {}, accountability: null, database }

describe('Sluggernaut item update orchestration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.readExistingItem.mockResolvedValue({ title: 'old', status: 'published' })
		mocks.coordinateMutation.mockReturnValue({ payload: { title: 'new', slug: 'new' } })
	})

	it('reads before coordination, awaits archive processing, then plans canonical redirects', async () => {
		const order: string[] = []
		mocks.readExistingItem.mockResolvedValueOnce({ title: 'old', status: 'archived' })
		mocks.processArchiveLifecycle.mockImplementation(() => {
			order.push('archive')
			return Promise.resolve()
		})
		mocks.processCanonicalRedirect.mockImplementation(() => {
			order.push('canonical')
			return Promise.resolve()
		})
		await expect(
			processItemUpdate({
				context,
				options,
				payload: { title: 'new', status: 'published' },
				collection: 'entries',
				key: 1,
				configuration,
				archiveSettings: {
					archive_field: 'status',
					archive_value: 'archived',
					unarchive_value: 'published',
				} as never,
				archiveFieldChanged: true,
				hasRelevantFields: true,
				eventContext: eventContext as never,
			}),
		).resolves.toEqual({ title: 'new', slug: 'new' })
		expect(order).toEqual(['archive', 'canonical'])
		expect(mocks.coordinateMutation).toHaveBeenCalledWith(
			expect.objectContaining({ existingItem: { title: 'old', status: 'archived' } }),
		)
		expect(mocks.processCanonicalRedirect).toHaveBeenCalledWith(
			expect.objectContaining({
				nextItem: { title: 'new', status: 'archived', slug: 'new' },
				database: eventContext.database,
			}),
		)
	})

	it('returns unrelated payloads after the required existing-item read without coordination', async () => {
		await expect(
			processItemUpdate({
				context,
				options,
				payload: { unrelated: true },
				collection: 'entries',
				key: 'a',
				configuration,
				archiveSettings: null,
				archiveFieldChanged: false,
				hasRelevantFields: false,
				eventContext: eventContext as never,
			}),
		).resolves.toEqual({ unrelated: true })
		expect(mocks.coordinateMutation).not.toHaveBeenCalled()
		expect(mocks.processCanonicalRedirect).not.toHaveBeenCalled()
	})

	it('does not create active canonical history when archiving and changing the canonical field together', async () => {
		await expect(
			processItemUpdate({
				context,
				options,
				payload: { title: 'new', status: 'archived', route: '/new' },
				collection: 'entries',
				key: 1,
				configuration,
				archiveSettings: {
					archive_field: 'status',
					archive_value: 'archived',
					unarchive_value: 'published',
				} as never,
				archiveFieldChanged: true,
				hasRelevantFields: true,
				eventContext: eventContext as never,
			}),
		).resolves.toBeDefined()

		expect(mocks.processArchiveLifecycle).toHaveBeenCalledWith(
			expect.objectContaining({ lifecycle: 'archive' }),
		)
		expect(mocks.processCanonicalRedirect).not.toHaveBeenCalled()
	})

	it('propagates existing-item and archive failures', async () => {
		mocks.readExistingItem.mockRejectedValueOnce(new Error('read failed'))
		await expect(
			processItemUpdate({
				context,
				options,
				payload: { title: 'new' },
				collection: 'entries',
				key: 1,
				configuration,
				archiveSettings: null,
				archiveFieldChanged: false,
				hasRelevantFields: true,
				eventContext: eventContext as never,
			}),
		).rejects.toThrow('read failed')
		mocks.processArchiveLifecycle.mockRejectedValueOnce(new Error('archive failed'))
		await expect(
			processItemUpdate({
				context,
				options,
				payload: { status: 'archived' },
				collection: 'entries',
				key: 1,
				configuration,
				archiveSettings: { archive_field: 'status', archive_value: 'archived' } as never,
				archiveFieldChanged: true,
				hasRelevantFields: false,
				eventContext: eventContext as never,
			}),
		).rejects.toThrow('archive failed')
	})
})
