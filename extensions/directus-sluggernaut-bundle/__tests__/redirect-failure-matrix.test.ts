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
	SLUGGERNAUT_THROW_ON_PROCESSING_ERROR: true,
	SLUGGERNAUT_REDIRECTS_COLLECTION: 'redirect_records',
	SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: 25,
}

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

	it('forwards configured collection and supports fail-open processing errors', async () => {
		const context = makeContext()
		const database = vi.fn()
		mocks.createRedirectService.mockRejectedValueOnce(new Error('missing collection'))
		await expect(
			processCanonicalRedirect({
				context,
				options: { ...options, SLUGGERNAUT_THROW_ON_PROCESSING_ERROR: false },
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
			'Sluggernaut skipped canonical redirect processing after an unexpected failure.',
			expect.objectContaining({
				collection: 'entries',
				redirectCollection: 'redirect_records',
				field: 'route',
				code: 'redirect-processing-failed',
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
		expect(mocks.readRelevantRedirects).toHaveBeenCalledWith({}, '/old', '/new', 25)
	})

	it('wraps unexpected canonical failures in an explicit processing error', async () => {
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
		).rejects.toMatchObject({
			code: 'SLUGGERNAUT_REDIRECT_PROCESSING',
			message: expect.stringContaining('redirect history'),
		})
		expect(context.logger.error).toHaveBeenCalledWith(
			'Sluggernaut failed to maintain canonical redirect history.',
			expect.objectContaining({
				code: 'redirect-processing-failed',
				error: expect.any(Error),
			}),
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
		).rejects.toMatchObject({ code: 'SLUGGERNAUT_REDIRECT_PROCESSING' })
	})

	it('keeps unexpected canonical failures fail-open when configured', async () => {
		const context = makeContext()
		mocks.readRelevantRedirects.mockRejectedValueOnce(new Error('read failed'))
		await expect(
			processCanonicalRedirect({
				context,
				options: { ...options, SLUGGERNAUT_THROW_ON_PROCESSING_ERROR: false },
				collection: 'entries',
				key: 'a',
				existingItem: { route: '/old' },
				nextItem: { route: '/new' },
				configuration,
				database: vi.fn(),
			} as never),
		).resolves.toBeUndefined()
		expect(context.logger.warn).toHaveBeenCalledWith(
			'Sluggernaut skipped canonical redirect processing after an unexpected failure.',
			expect.objectContaining({ code: 'redirect-processing-failed' }),
		)
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
		).rejects.toMatchObject({ code: 'SLUGGERNAUT_REDIRECT_PROCESSING' })
		expect(context.logger.error).toHaveBeenCalledWith(
			'Sluggernaut failed to maintain redirect lifecycle history.',
			expect.objectContaining({ code: 'redirect-processing-failed', lifecycle: 'archive' }),
		)

		mocks.createRedirectService.mockRejectedValueOnce(new Error('unavailable'))
		await expect(
			processArchiveLifecycle({
				context,
				options: { ...options, SLUGGERNAUT_THROW_ON_PROCESSING_ERROR: false },
				collection: 'entries',
				key: 1,
				lifecycle: 'archive',
				database: vi.fn(),
			} as never),
		).resolves.toBeUndefined()
		expect(context.logger.warn).toHaveBeenCalledWith(
			'Sluggernaut skipped redirect lifecycle processing after an unexpected failure.',
			expect.objectContaining({ code: 'redirect-processing-failed', lifecycle: 'archive' }),
		)
	})
})
