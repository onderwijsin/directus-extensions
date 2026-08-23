import type { CollectionConfiguration } from '../src/shared/configuration/types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	createRedirectService: vi.fn(),
	readRelevantRedirects: vi.fn(),
	applyRedirectPlan: vi.fn(),
	readManagedRedirectsForItem: vi.fn(),
	applyRedirectLifecyclePlan: vi.fn(),
}))

vi.mock('../src/sluggernaut-hook/redirects/service', () => ({
	createRedirectService: mocks.createRedirectService,
}))
vi.mock('../src/sluggernaut-hook/redirects/history/operations', () => ({
	readRelevantRedirects: mocks.readRelevantRedirects,
	applyRedirectPlan: mocks.applyRedirectPlan,
	readManagedRedirectsForItem: mocks.readManagedRedirectsForItem,
	applyRedirectLifecyclePlan: mocks.applyRedirectLifecyclePlan,
}))

import { processCanonicalRedirect } from '../src/sluggernaut-hook/redirects/history/canonical'
import { processDeletedItems } from '../src/sluggernaut-hook/redirects/history/deletion'
import { processArchiveLifecycle } from '../src/sluggernaut-hook/redirects/history/lifecycle'

const configuration: CollectionConfiguration = {
	slugs: [],
	permalinks: [
		{
			field: 'route',
			sort: 1,
			options: {
				generateFromSlug: false,
				updateOnSlugChange: false,
				validatePrefixOnManualInput: false,
				trailingSlash: false,
				enforceTrailingSlashOnManualInput: false,
				automaticRedirects: true,
				includeUnmanagedRedirectsInPlanning: true,
				unmanagedRedirectConflictBehavior: 'override',
			},
		},
	],
	warnings: [],
}
const options = {
	SLUGGERNAUT_REDIRECTS_ENABLED: true,
	SLUGGERNAUT_REDIRECTS_COLLECTION: 'redirect_records',
} as never

function makeContext() {
	return { logger: { warn: vi.fn(), error: vi.fn() } }
}

describe('Sluggernaut redirect failure matrix', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.createRedirectService.mockResolvedValue({})
		mocks.readRelevantRedirects.mockResolvedValue([])
		mocks.readManagedRedirectsForItem.mockResolvedValue([])
		mocks.applyRedirectPlan.mockResolvedValue(undefined)
		mocks.applyRedirectLifecyclePlan.mockResolvedValue(undefined)
	})

	it('forwards configured collection and transaction and logs the exact optional-runtime warning', async () => {
		const context = makeContext()
		const database = vi.fn()
		mocks.createRedirectService.mockRejectedValueOnce(new Error('missing collection'))
		await expect(
			processCanonicalRedirect({
				context,
				options,
				collection: 'entries',
				key: 1,
				existingItem: { route: '/old' },
				nextItem: { route: '/new' },
				configuration,
				database,
			} as never),
		).resolves.toBeUndefined()
		expect(mocks.createRedirectService).toHaveBeenCalledWith(
			context,
			'redirect_records',
			database,
		)
		expect(context.logger.warn).toHaveBeenCalledWith(
			'Sluggernaut skipped redirect processing because the redirect collection is unavailable or incompatible.',
			expect.objectContaining({
				collection: 'entries',
				redirectCollection: 'redirect_records',
				field: 'route',
				code: 'redirect-runtime-unavailable',
				error: expect.any(Error),
			}),
		)

		mocks.createRedirectService.mockResolvedValueOnce({})
		await processCanonicalRedirect({
			context,
			options,
			collection: 'entries',
			key: 1,
			existingItem: { route: '/old' },
			nextItem: { route: '/new' },
			configuration,
			database,
		} as never)
		expect(mocks.readRelevantRedirects).toHaveBeenCalledWith({}, '/old', '/new')
	})

	it('logs planner and application failures without blocking content derivation', async () => {
		const context = makeContext()
		mocks.readRelevantRedirects.mockRejectedValueOnce(new Error('read failed'))
		await expect(
			processCanonicalRedirect({
				context,
				options,
				collection: 'entries',
				key: 'a',
				existingItem: { route: '/old' },
				nextItem: { route: '/new' },
				configuration,
				database: vi.fn(),
			} as never),
		).resolves.toBeUndefined()
		expect(context.logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('skipped redirect processing'),
			expect.any(Object),
		)

		mocks.applyRedirectPlan.mockRejectedValueOnce(new Error('write failed'))
		await expect(
			processCanonicalRedirect({
				context,
				options,
				collection: 'entries',
				key: 'a',
				existingItem: { route: '/old' },
				nextItem: { route: '/new' },
				configuration,
				database: vi.fn(),
			} as never),
		).resolves.toBeUndefined()
	})

	it('processes each deleted key and forwards lifecycle plans without creating redirects', async () => {
		const context = makeContext()
		const database = vi.fn()
		await processDeletedItems({
			context,
			options,
			collection: 'entries',
			keys: [1, '2'],
			database,
		} as never)
		expect(mocks.readManagedRedirectsForItem).toHaveBeenNthCalledWith(1, {}, 'entries', 1)
		expect(mocks.readManagedRedirectsForItem).toHaveBeenNthCalledWith(2, {}, 'entries', '2')
		expect(mocks.applyRedirectLifecyclePlan).not.toHaveBeenCalled()
		expect(mocks.createRedirectService).toHaveBeenCalledWith(
			context,
			'redirect_records',
			database,
		)
		expect(mocks.applyRedirectPlan).not.toHaveBeenCalled()
	})

	it('handles archive and unarchive branches, preserving lifecycle-only operations', async () => {
		const context = makeContext()
		await processArchiveLifecycle({
			context,
			options,
			collection: 'entries',
			key: 1,
			lifecycle: 'archive',
			database: vi.fn(),
		} as never)
		expect(mocks.applyRedirectLifecyclePlan).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ deactivate: expect.any(Array), reactivate: [] }),
		)
		mocks.applyRedirectLifecyclePlan.mockClear()
		await processArchiveLifecycle({
			context,
			options,
			collection: 'entries',
			key: 1,
			lifecycle: 'unarchive',
			database: vi.fn(),
		} as never)
		expect(mocks.applyRedirectLifecyclePlan).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ deactivate: [], reactivate: expect.any(Array) }),
		)
		expect(mocks.applyRedirectPlan).not.toHaveBeenCalled()

		mocks.createRedirectService.mockRejectedValueOnce(new Error('unavailable'))
		await expect(
			processArchiveLifecycle({
				context,
				options,
				collection: 'entries',
				key: 1,
				lifecycle: 'archive',
				database: vi.fn(),
			} as never),
		).resolves.toBeUndefined()
		expect(context.logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('skipped redirect lifecycle processing'),
			expect.objectContaining({ code: 'redirect-runtime-unavailable', lifecycle: 'archive' }),
		)
	})
})
