/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-return */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	defineHook: vi.fn((callback: unknown) => callback),
	setup: { start: vi.fn(), end: vi.fn(), isEnabled: vi.fn(() => true) },
	startup: { schema: vi.fn(), data: vi.fn() },
	ensureSchema: vi.fn(),
	ensurePolicy: vi.fn(),
}))

vi.mock('@directus/extensions-sdk', () => ({ defineHook: mocks.defineHook }))
vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	ensureDirectusPolicy: mocks.ensurePolicy,
	ensureDirectusSchema: mocks.ensureSchema,
	validatePolicyDefinition: () => ({
		policies: [
			{ id: '0c9f0b1e-0a0b-4b7c-8a27-4b7a6e1f2d31', name: 'Manage', permissions: [] },
			{ id: '2e7a4c63-1d5f-46bb-9b02-8f3c7a5d6e14', name: 'Read', permissions: [] },
			{ id: '7b3d9e20-5f61-4a8c-b274-1e6d9f0a3c58', name: 'Trigger', permissions: [] },
		],
	}),
	validateSchemaDefinition: () => ({ collections: [], fields: [], relations: [] }),
	createDirectusStartupCoordinator: () => mocks.startup,
	extensionSetup: () => mocks.setup,
	withCollectionIdentity: (collection: string, schema: unknown) => ({ collection, schema }),
	validateExtensionOptions: () => ({
		COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED: true,
		DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
		DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
		COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR: true,
		COOLIFY_APPLICATIONS_COLLECTION: 'deployment_targets',
		COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID: 'manage-custom',
		COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID: 'read-custom',
		COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: 'trigger-custom',
	}),
}))

import hook from '../src/coolify-deployments-hook'

describe('Coolify startup hook', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
	})

	it('registers schema and data startup tasks with resolved policy IDs', async () => {
		hook(
			{ action: vi.fn(), filter: vi.fn(), init: vi.fn(), schedule: vi.fn(), embed: vi.fn() },
			{
				env: {},
				logger: {},
				database: {},
				getSchema: vi.fn(),
				services: {},
			} as never,
		)

		expect(mocks.setup.start).toHaveBeenCalledOnce()
		expect(mocks.startup.schema).toHaveBeenCalledOnce()
		expect(mocks.startup.data).toHaveBeenCalledOnce()
		const schemaRegistration = mocks.startup.schema.mock.calls[0]
		const dataRegistration = mocks.startup.data.mock.calls[0]
		if (!schemaRegistration || !dataRegistration)
			throw new Error('Expected startup registrations')
		await schemaRegistration[0]({ lockProvider: 'lock' })
		await dataRegistration[0]({ lockProvider: 'lock' })
		expect(mocks.ensureSchema).toHaveBeenCalledWith(
			expect.objectContaining({
				definition: expect.objectContaining({ collection: 'deployment_targets' }),
			}),
		)
		expect(mocks.ensurePolicy.mock.calls.map(([call]) => call.definition.id)).toEqual([
			'manage-custom',
			'read-custom',
			'trigger-custom',
		])
		expect(mocks.setup.end).toHaveBeenCalledOnce()
	})

	it('does not register startup work when disabled', () => {
		mocks.setup.isEnabled.mockReturnValue(false)
		hook(
			{ action: vi.fn(), filter: vi.fn(), init: vi.fn(), schedule: vi.fn(), embed: vi.fn() },
			{ env: {}, logger: {} } as never,
		)
		expect(mocks.startup.schema).not.toHaveBeenCalled()
		expect(mocks.startup.data).not.toHaveBeenCalled()
		expect(mocks.setup.end).not.toHaveBeenCalled()
	})
})
