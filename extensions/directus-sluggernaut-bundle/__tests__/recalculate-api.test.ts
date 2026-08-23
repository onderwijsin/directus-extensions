/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-return */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	defineOperationApi: vi.fn((definition: unknown) => definition),
	setup: { start: vi.fn(), end: vi.fn(), isEnabled: vi.fn(() => true) },
	validateOptions: vi.fn((options: unknown) => options),
	validateEnvironment: vi.fn(() => ({ SLUGGERNAUT_REDIRECTS_ENABLED: true })),
	recalculateFields: vi
		.fn()
		.mockResolvedValue({ processed: 2, updated: 1, skipped: 1, failed: 0 }),
	validateRecalculateOptions: vi.fn((options: unknown) => options),
}))

vi.mock('@directus/extensions-sdk', () => ({ defineOperationApi: mocks.defineOperationApi }))
vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	extensionSetup: () => mocks.setup,
	validateExtensionOptions: mocks.validateEnvironment,
}))
vi.mock('../src/sluggernaut-recalculate/handler', () => ({
	recalculateFields: mocks.recalculateFields,
}))
vi.mock('../src/sluggernaut-recalculate/validation', () => ({
	validateRecalculateOptions: mocks.validateRecalculateOptions,
}))

import operation from '../src/sluggernaut-recalculate/api'

const context = { env: {}, logger: { warn: vi.fn() }, accountability: null }

describe('Sluggernaut recalculation API orchestration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
		mocks.validateRecalculateOptions.mockImplementation((options: unknown) => options)
		mocks.validateEnvironment.mockReturnValue({ SLUGGERNAUT_REDIRECTS_ENABLED: true })
		mocks.recalculateFields.mockResolvedValue({
			processed: 2,
			updated: 1,
			skipped: 1,
			failed: 0,
		})
	})

	it('ends setup and returns zero statistics when disabled', async () => {
		mocks.setup.isEnabled.mockReturnValue(false)
		await expect(
			operation.handler({ collection: 'entries' } as never, context as never),
		).resolves.toEqual({ processed: 0, updated: 0, skipped: 0, failed: 0 })
		expect(mocks.setup.start).toHaveBeenCalledOnce()
		expect(mocks.setup.end).toHaveBeenCalledOnce()
		expect(mocks.recalculateFields).not.toHaveBeenCalled()
	})

	it('forwards validated options and context exactly once and always ends setup on success', async () => {
		const options = { collection: 'entries', fields: ['slug'], createRedirects: false }
		await expect(operation.handler(options as never, context as never)).resolves.toEqual({
			processed: 2,
			updated: 1,
			skipped: 1,
			failed: 0,
		})
		expect(mocks.validateRecalculateOptions).toHaveBeenCalledWith(options, context)
		expect(mocks.validateEnvironment).toHaveBeenCalledOnce()
		expect(mocks.recalculateFields).toHaveBeenCalledWith(options, context, {
			SLUGGERNAUT_REDIRECTS_ENABLED: true,
		})
		expect(mocks.setup.end).toHaveBeenCalledOnce()
	})

	it('ends setup when validation, environment, or handler fails', async () => {
		mocks.validateRecalculateOptions.mockImplementationOnce(() => {
			throw new Error('invalid options')
		})
		await expect(operation.handler({} as never, context as never)).rejects.toThrow(
			'invalid options',
		)
		expect(mocks.setup.end).toHaveBeenCalledOnce()

		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
		mocks.validateRecalculateOptions.mockImplementation((options: unknown) => options)
		mocks.validateEnvironment.mockImplementationOnce(() => {
			throw new Error('invalid environment')
		})
		await expect(operation.handler({} as never, context as never)).rejects.toThrow(
			'invalid environment',
		)
		expect(mocks.setup.end).toHaveBeenCalledOnce()

		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
		mocks.validateEnvironment.mockReturnValue({ SLUGGERNAUT_REDIRECTS_ENABLED: true })
		mocks.recalculateFields.mockRejectedValueOnce(new Error('handler failed'))
		await expect(operation.handler({} as never, context as never)).rejects.toThrow(
			'handler failed',
		)
		expect(mocks.setup.end).toHaveBeenCalledOnce()
	})
})
