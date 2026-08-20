/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-return */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type ApplicationFilter = (payload: unknown) => unknown

const mocks = vi.hoisted(() => ({
	defineHook: vi.fn((callback: unknown) => callback),
	filter: vi.fn<(event: string, callback: ApplicationFilter) => void>(),
	setup: { start: vi.fn(), end: vi.fn(), isEnabled: vi.fn(() => true) },
	startup: { schema: vi.fn(), data: vi.fn() },
	ensureSchema: vi.fn(),
	ensurePolicy: vi.fn(),
	getApplication: vi.fn(),
	logger: { error: vi.fn() },
}))

vi.mock('@directus/extensions-sdk', () => ({ defineHook: mocks.defineHook }))
vi.mock('../src/shared/coolify-client', () => ({
	createCoolifyDeploymentClient: () => ({ getApplication: mocks.getApplication }),
}))
vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	ensureDirectusPolicy: mocks.ensurePolicy,
	ensureDirectusSchema: mocks.ensureSchema,
	validatePolicyDefinition: () => ({
		policies: [
			{
				id: '0c9f0b1e-0a0b-4b7c-8a27-4b7a6e1f2d31',
				name: 'Manage',
				permissions: [{ collection: 'coolify_applications', action: 'read' }],
			},
			{
				id: '2e7a4c63-1d5f-46bb-9b02-8f3c7a5d6e14',
				name: 'Read',
				permissions: [{ collection: 'coolify_applications', action: 'read' }],
			},
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
		COOLIFY_URL: 'https://coolify.example.com',
		COOLIFY_TOKEN: 'token',
		COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID: 'manage-custom',
		COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID: 'read-custom',
		COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: 'trigger-custom',
	}),
}))

import hook from '../src/coolify-deployments-hook'

const application = {
	uuid: 'application-1',
	name: 'Frontend',
	fqdn: 'https://frontend.example.com',
	status: null,
	environmentUuid: 'environment-1',
	environmentName: 'Production',
	projectUuid: 'project-1',
	projectName: 'Frontend project',
	environmentId: null,
	gitBranch: null,
	gitCommitSha: null,
	gitRepository: null,
	buildPack: null,
	serverName: null,
}

describe('Coolify application create hook', () => {
	const registerHook = () =>
		hook(
			{
				action: vi.fn(),
				filter: mocks.filter,
				init: vi.fn(),
				schedule: vi.fn(),
				embed: vi.fn(),
			} as never,
			{
				env: {},
				logger: mocks.logger,
				database: {},
				getSchema: vi.fn(),
				services: {},
			} as never,
		)

	beforeEach(() => {
		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
		mocks.getApplication.mockResolvedValue(application)
		registerHook()
	})

	it('registers schema and data startup tasks with resolved policy IDs', async () => {
		expect(mocks.setup.start).toHaveBeenCalledOnce()
		expect(mocks.startup.schema).toHaveBeenCalledOnce()
		expect(mocks.startup.data).toHaveBeenCalledOnce()
		expect(mocks.startup.data.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.filter.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		)
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
		expect(
			mocks.ensurePolicy.mock.calls.flatMap(([call]) => call.definition.permissions),
		).toEqual([
			{ collection: 'deployment_targets', action: 'read' },
			{ collection: 'deployment_targets', action: 'read' },
		])
		expect(mocks.setup.end).toHaveBeenCalledOnce()
	})

	it('enriches a new application from the bypassed Coolify lookup', async () => {
		const filter = mocks.filter.mock.calls[0]?.[1]
		if (typeof filter !== 'function') throw new Error('Expected application create filter')

		await expect(
			filter({
				application_uuid: ' application-1 ',
				name: 'user value',
				project_uuid: 'user project',
				enabled: false,
			}),
		).resolves.toEqual({
			application_uuid: 'application-1',
			name: 'Frontend',
			project_uuid: 'project-1',
			project_name: 'Frontend project',
			environment_uuid: 'environment-1',
			environment_name: 'Production',
			production_url: 'https://frontend.example.com',
			enabled: true,
			deploy_enabled: true,
		})
		expect(mocks.getApplication).toHaveBeenCalledWith('application-1', {
			bypassAllowList: true,
		})
	})

	it('rejects missing provider data', async () => {
		mocks.getApplication.mockResolvedValueOnce({ ...application, projectName: null })
		const filter = mocks.filter.mock.calls[0]?.[1]
		if (typeof filter !== 'function') throw new Error('Expected application create filter')

		await expect(filter({ application_uuid: 'application-1' })).rejects.toThrow(
			'Coolify application is missing project name',
		)
	})

	it('keeps only the first URL when Coolify returns multiple production URLs', async () => {
		mocks.getApplication.mockResolvedValueOnce({
			...application,
			fqdn: 'https://hello.frontend01.kaas.onderwijs.dev,https://www.hello.frontend01.kaas.onderwijs.dev',
		})
		const filter = mocks.filter.mock.calls[0]?.[1]
		if (typeof filter !== 'function') throw new Error('Expected application create filter')

		await expect(filter({ application_uuid: 'application-1' })).resolves.toMatchObject({
			production_url: 'https://hello.frontend01.kaas.onderwijs.dev',
		})
	})

	it('rejects failed Coolify requests with a Directus payload error', async () => {
		mocks.getApplication.mockRejectedValueOnce(new Error('Coolify unavailable'))
		const filter = mocks.filter.mock.calls[0]?.[1]
		if (typeof filter !== 'function') throw new Error('Expected application create filter')

		await expect(filter({ application_uuid: 'application-1' })).rejects.toThrow(
			'Unable to load application details from Coolify',
		)
		expect(mocks.logger.error).toHaveBeenCalledOnce()
	})

	it('rejects updates to provider-managed fields', () => {
		const updateFilter = mocks.filter.mock.calls.find(
			([event]) => event === 'deployment_targets.items.update',
		)?.[1]
		if (typeof updateFilter !== 'function')
			throw new Error('Expected application update filter')

		expect(() => updateFilter({ application_uuid: 'another-application' })).toThrow(
			'application_uuid is managed by Coolify and cannot be updated',
		)
		expect(updateFilter({ enabled: false, deploy_enabled: true })).toEqual({
			enabled: false,
			deploy_enabled: true,
		})
		expect(() => updateFilter([{ production_url: 'https://attacker.test' }])).toThrow(
			'production_url is managed by Coolify and cannot be updated',
		)
	})

	it('does not register work when disabled', () => {
		mocks.setup.isEnabled.mockReturnValue(false)
		mocks.filter.mockClear()
		mocks.startup.schema.mockClear()
		mocks.startup.data.mockClear()
		mocks.setup.end.mockClear()
		registerHook()
		expect(mocks.filter).not.toHaveBeenCalled()
		expect(mocks.startup.schema).not.toHaveBeenCalled()
		expect(mocks.startup.data).not.toHaveBeenCalled()
		expect(mocks.setup.end).not.toHaveBeenCalled()
	})
})
