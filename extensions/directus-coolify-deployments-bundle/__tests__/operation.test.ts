/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-argument */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	app: vi.fn(),
	api: vi.fn(),
	setup: { start: vi.fn(), end: vi.fn(), isEnabled: vi.fn(() => true) },
	readOne: vi.fn(),
	deploy: vi.fn(),
}))
vi.mock('@directus/extensions-sdk', () => ({
	defineOperationApp: (definition: unknown) => {
		mocks.app(definition)
		return definition
	},
	defineOperationApi: (definition: unknown) => {
		mocks.api(definition)
		return definition
	},
}))
vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	extensionSetup: () => mocks.setup,
}))
vi.mock('../src/shared/coolify-client', () => ({
	createCoolifyDeploymentClient: () => ({ deploy: mocks.deploy }),
}))

import operationApp from '../src/coolify-deploy-operation'
import operationApi from '../src/coolify-deploy-operation/api'

describe('Coolify deploy operation', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
	})

	const context = {
		env: {
			COOLIFY_URL: 'https://coolify.example.com',
			COOLIFY_TOKEN: 'token',
		},
		logger: { info: vi.fn() },
		getSchema: vi.fn().mockResolvedValue({}),
		services: {
			ItemsService: class {
				public readOne = mocks.readOne
			},
		},
	}

	it('rechecks the selected application and triggers its deployment', async () => {
		mocks.readOne.mockResolvedValue({
			enabled: true,
			deploy_enabled: true,
			application_uuid: 'application-1',
		})
		mocks.deploy.mockResolvedValue([{ message: 'queued' }])

		await expect(
			operationApi.handler({ application: 'directus-application-1' }, context as never),
		).resolves.toEqual([{ message: 'queued' }])
		expect(mocks.readOne).toHaveBeenCalledWith('directus-application-1')
		expect(mocks.deploy).toHaveBeenCalledWith({ uuid: 'application-1' })
	})

	it.each([
		{ enabled: false, deploy_enabled: true },
		{ enabled: true, deploy_enabled: false },
	])(
		'rejects an application that is no longer deployable: $enabled/$deploy_enabled',
		async (flags) => {
			mocks.readOne.mockResolvedValue({ ...flags, application_uuid: 'application-1' })

			await expect(
				operationApi.handler({ application: 'directus-application-1' }, context as never),
			).rejects.toMatchObject({
				code: 'FORBIDDEN',
				status: 403,
			})
			expect(mocks.deploy).not.toHaveBeenCalled()
		},
	)

	it('exposes an application ID input without hardcoding the configured collection', () => {
		expect(operationApp).toMatchObject({ id: 'coolify-deploy', name: 'Coolify Deploy' })
		expect(operationApp.options).toEqual([
			expect.objectContaining({
				field: 'application',
				meta: expect.objectContaining({
					interface: 'input',
					note: 'Enter the Directus ID of an enabled, deploy-enabled application.',
				}),
			}),
		])
	})

	it('registers a server handler for the operation', () => {
		expect(operationApi).toMatchObject({ id: 'coolify-deploy' })
		expect(operationApi.handler).toBeTypeOf('function')
	})
})
