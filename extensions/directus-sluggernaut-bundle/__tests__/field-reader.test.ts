/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-return */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	initializeCache: vi.fn(),
	withCache: vi.fn(),
	clear: vi.fn(),
	readAll: vi.fn(),
	logger: { error: vi.fn() },
}))

vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	initializeCache: mocks.initializeCache,
	withCache: mocks.withCache,
}))

import { createFieldReader, fieldsCacheKey } from '../src/server/field-reader'

describe('Sluggernaut field reader cache', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.initializeCache.mockReturnValue({ clear: mocks.clear })
		mocks.withCache.mockImplementation(
			async ({ cache }: { cache: unknown; key: string }, factory: () => Promise<unknown>) => {
				if (cache === null) return factory()
				return factory()
			},
		)
	})

	it('uses collection-scoped keys and forwards cache TTL, schema, accountability, and database', async () => {
		const readAll = mocks.readAll.mockResolvedValue([{ field: 'title' }])
		const FieldsService = vi.fn(function () {
			return { readAll }
		})
		const getSchema = vi.fn().mockResolvedValue({ version: 1 })
		const database = vi.fn()
		const reader = createFieldReader(
			{
				env: {},
				getSchema,
				database,
				services: { FieldsService },
				logger: mocks.logger,
			} as never,
			{ ttl: 2500 },
		)
		expect(fieldsCacheKey('editorial_entries')).toBe('sluggernaut:fields:editorial_entries')
		await expect(reader.read('editorial_entries')).resolves.toEqual([{ field: 'title' }])
		expect(mocks.initializeCache).toHaveBeenCalledWith({}, { ttl: 2500 })
		expect(mocks.withCache).toHaveBeenCalledWith(
			expect.objectContaining({ key: fieldsCacheKey('editorial_entries') }),
			expect.any(Function),
		)
		expect(FieldsService).toHaveBeenCalledWith({
			schema: { version: 1 },
			accountability: expect.any(Object),
			knex: database,
		})
		expect(readAll).toHaveBeenCalledWith('editorial_entries')
	})

	it('disables caching when no TTL options are supplied and reports cache-clear failures', async () => {
		mocks.readAll.mockResolvedValue([])
		const FieldsService = vi.fn(function () {
			return { readAll: mocks.readAll }
		})
		const reader = createFieldReader({
			env: {},
			getSchema: vi.fn().mockResolvedValue({}),
			services: { FieldsService },
			logger: mocks.logger,
		} as never)
		await reader.read('entries')
		expect(mocks.initializeCache).not.toHaveBeenCalled()
		expect(mocks.withCache).toHaveBeenCalledWith(
			expect.objectContaining({ cache: null }),
			expect.any(Function),
		)
		reader.clearCache()
		expect(mocks.clear).not.toHaveBeenCalled()

		const cachedReader = createFieldReader(
			{
				env: {},
				getSchema: vi.fn().mockResolvedValue({}),
				services: { FieldsService },
				logger: mocks.logger,
			} as never,
			{ ttl: 1 },
		)
		mocks.clear.mockRejectedValueOnce(new Error('cache unavailable'))
		cachedReader.clearCache()
		await vi.waitFor(() =>
			expect(mocks.logger.error).toHaveBeenCalledWith(
				'Failed to clear Sluggernaut field cache.',
				expect.objectContaining({ error: expect.any(Error) }),
			),
		)
	})
})
