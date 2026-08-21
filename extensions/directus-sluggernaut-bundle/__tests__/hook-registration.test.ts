/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-return */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	defineHook: vi.fn((callback: unknown) => callback),
	setup: { start: vi.fn(), end: vi.fn(), isEnabled: vi.fn(() => true) },
	startup: { schema: vi.fn(), data: vi.fn() },
	ensureSchema: vi.fn(),
	ensurePolicy: vi.fn(),
	collectionReadOne: vi.fn().mockResolvedValue({}),
	logger: { warn: vi.fn() },
}))

vi.mock('@directus/extensions-sdk', () => ({ defineHook: mocks.defineHook }))
vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	createDirectusStartupCoordinator: () => mocks.startup,
	ensureDirectusPolicy: mocks.ensurePolicy,
	ensureDirectusSchema: mocks.ensureSchema,
	extensionSetup: () => mocks.setup,
	validateExtensionOptions: () => ({
		SLUGGERNAUT_ENABLED: true,
		SLUGGERNAUT_REDIRECTS_ENABLED: true,
		SLUGGERNAUT_REDIRECTS_COLLECTION: 'custom_redirects',
		SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 60_000,
		SLUGGERNAUT_SCHEMA_CHANGES_ENABLED: true,
		SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR: true,
		SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED: true,
		SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED: true,
		DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
		DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
	}),
}))

import hook from '../src/sluggernaut-hook'

function registerHook() {
	const action = vi.fn()
	hook(
		{
			action,
			filter: vi.fn(),
		} as never,
		{
			env: {},
			logger: mocks.logger,
			database: {},
			getSchema: vi.fn().mockResolvedValue({}),
			services: {
				CollectionsService: class {
					public readOne = mocks.collectionReadOne
				},
			} as never,
		} as never,
	)
	return action
}

describe('Sluggernaut startup registration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
		mocks.collectionReadOne.mockResolvedValue({})
		registerHook()
	})

	it('registers gated schema and policy startup work', async () => {
		expect(mocks.startup.schema).toHaveBeenCalledOnce()
		expect(mocks.startup.data).toHaveBeenCalledOnce()

		const schemaCallback = mocks.startup.schema.mock.calls[0]?.[0]
		const dataCallback = mocks.startup.data.mock.calls[0]?.[0]
		if (typeof schemaCallback !== 'function' || typeof dataCallback !== 'function') {
			throw new Error('Expected startup callbacks')
		}

		await schemaCallback({ lockProvider: 'lock' })
		await dataCallback({ lockProvider: 'lock' })

		expect(mocks.ensureSchema).toHaveBeenCalledWith(
			expect.objectContaining({
				definition: expect.objectContaining({
					collections: [expect.objectContaining({ collection: 'custom_redirects' })],
				}),
			}),
		)
		expect(mocks.ensurePolicy.mock.calls.map(([input]) => input.definition.name)).toEqual([
			'Can Manage Redirects',
			'Can Read Active Redirects',
		])
		expect(mocks.ensurePolicy.mock.calls[0]?.[0].definition.permissions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ collection: 'custom_redirects', action: 'create' }),
			]),
		)
	})

	it('registers item lifecycle dependencies when caching is disabled', () => {
		const action = registerHook()
		expect(action.mock.calls.map(([event]) => event)).toEqual([
			'fields.create',
			'fields.update',
			'fields.delete',
			'items.delete',
			'items.update',
		])
	})

	it('skips policy registration when the redirect collection is unavailable', async () => {
		mocks.collectionReadOne.mockRejectedValueOnce(new Error('missing'))
		mocks.startup.data.mockClear()
		registerHook()
		const dataCallback = mocks.startup.data.mock.calls[0]?.[0]
		if (typeof dataCallback !== 'function') throw new Error('Expected data callback')

		await dataCallback({ lockProvider: 'lock' })

		expect(mocks.ensurePolicy).not.toHaveBeenCalled()
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			'Sluggernaut policy registration skipped; redirect collection is unavailable.',
			expect.objectContaining({ code: 'redirect-collection-unavailable' }),
		)
	})
})
