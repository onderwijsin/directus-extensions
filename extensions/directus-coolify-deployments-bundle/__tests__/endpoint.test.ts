/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-call */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	rejectWhileSchemaLocked: vi.fn((_next: (error?: unknown) => void) => Promise.resolve(false)),
	setup: { start: vi.fn(), end: vi.fn(), isEnabled: vi.fn(() => true) },
	validateExtensionOptions: vi.fn(() => ({
		COOLIFY_URL: 'https://coolify.example.com',
		COOLIFY_TOKEN: 'token',
		COOLIFY_APPLICATIONS_COLLECTION: 'deployment_targets',
		COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID: 'manage-policy',
		COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID: 'read-policy',
		COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: 'trigger-policy',
		COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS: 3000,
	})),
	client: {
		listConfiguredApplication: vi.fn().mockResolvedValue([]),
		getConfiguredApplication: vi.fn(),
		getApplication: vi.fn(),
		listApplicationDeployments: vi.fn().mockResolvedValue([]),
		getLatestApplicationDeployment: vi.fn().mockResolvedValue(null),
		getDeployment: vi.fn(),
		deploy: vi.fn(),
		cancelDeployment: vi.fn(),
	},
}))

vi.mock('@directus/extensions-sdk', () => ({
	defineEndpoint: (definition: unknown) => definition,
}))
vi.mock('@directus/errors', () => ({
	createError: () => class extends Error {},
	ForbiddenError: class extends Error {},
}))
vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	extensionSetup: () => mocks.setup,
	rejectWhileSchemaLocked: mocks.rejectWhileSchemaLocked,
	validateExtensionOptions: mocks.validateExtensionOptions,
}))
vi.mock('../src/shared/coolify-client', () => ({
	createCoolifyDeploymentClient: () => mocks.client,
}))
import endpoint from '../src/coolify-deployments-endpoint'

const runEndpoint = (router: ReturnType<typeof createRouter>) => {
	const handler = Reflect.get(endpoint, 'handler')
	if (typeof handler !== 'function') throw new Error('Expected endpoint handler')
	Reflect.apply(handler, undefined, [
		router,
		{
			env: {},
			logger: { error: vi.fn() },
			services: { AccessService: vi.fn() },
			getSchema: vi.fn().mockResolvedValue({}),
		},
	])
}

interface ResponseMock {
	status: ReturnType<typeof vi.fn>
	setHeader: ReturnType<typeof vi.fn>
	json: ReturnType<typeof vi.fn>
}

const createResponse = (): ResponseMock => {
	const response: ResponseMock = {
		status: vi.fn(),
		setHeader: vi.fn(),
		json: vi.fn(),
	}
	response.status.mockReturnValue(response)
	return response
}

const createRouter = () => ({
	use: vi.fn(),
	get: vi.fn(),
	post: vi.fn(),
})

describe('Coolify deployment endpoint orchestration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.rejectWhileSchemaLocked.mockResolvedValue(false)
		mocks.setup.isEnabled.mockReturnValue(true)
	})

	it('applies authentication and schema readiness once as router middleware', async () => {
		const router = createRouter()
		runEndpoint(router)

		expect(router.use).toHaveBeenCalledOnce()
		expect(router.get).toHaveBeenCalledTimes(4)
		expect(router.post).toHaveBeenCalledTimes(2)

		const middleware = router.use.mock.calls[0]?.[0]
		if (typeof middleware !== 'function') throw new Error('Expected middleware')

		const unauthenticatedResponse = createResponse()
		const next = vi.fn()
		middleware(
			{ accountability: null, get: () => undefined, protocol: 'https' },
			unauthenticatedResponse,
			next,
		)
		expect(next).toHaveBeenCalledWith(expect.any(Error))

		const authenticatedResponse = createResponse()
		const authenticatedNext = vi.fn()
		middleware(
			{
				accountability: {
					role: 'role-id',
					roles: ['role-id'],
					user: 'user-id',
					admin: false,
					app: true,
					ip: null,
				},
				get: () => undefined,
				protocol: 'https',
			},
			authenticatedResponse,
			authenticatedNext,
		)
		await vi.waitFor(() => expect(authenticatedNext).toHaveBeenCalledOnce())
	})

	it('rejects every route while the schema is locked', async () => {
		mocks.rejectWhileSchemaLocked.mockImplementation((next) => {
			next(new Error('schema locked'))
			return Promise.resolve(true)
		})
		const router = createRouter()
		runEndpoint(router)

		const middleware = router.use.mock.calls[0]?.[0]
		if (typeof middleware !== 'function') throw new Error('Expected middleware')

		const response = createResponse()
		const next = vi.fn()
		middleware(
			{
				accountability: {
					role: 'role-id',
					roles: ['role-id'],
					user: 'user-id',
					admin: false,
					app: true,
					ip: null,
				},
				get: () => undefined,
				protocol: 'https',
			},
			response,
			next,
		)
		await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.any(Error)))
	})

	it('rejects cross-origin requests in the shared middleware', () => {
		const router = createRouter()
		runEndpoint(router)
		const response = createResponse()
		const next = vi.fn()
		const middleware = router.use.mock.calls[0]?.[0]
		if (typeof middleware !== 'function') throw new Error('Expected middleware')
		middleware(
			{
				accountability: {
					role: 'role-id',
					roles: ['role-id'],
					user: 'user-id',
					admin: false,
					app: true,
					ip: null,
				},
				get: (header: string) =>
					header === 'origin' ? 'https://evil.example.com' : undefined,
				protocol: 'https',
			},
			response,
			next,
		)
		expect(next).toHaveBeenCalledWith(expect.any(Error))
	})

	it('sets the polling header and serves the provider-independent permission route', async () => {
		const router = createRouter()
		runEndpoint(router)
		const middleware = router.use.mock.calls[0]?.[0]
		if (typeof middleware !== 'function') throw new Error('Expected middleware')
		const response = createResponse()
		const middlewareNext = vi.fn()
		middleware(
			{
				accountability: {
					role: 'role-id',
					roles: ['role-id'],
					user: 'user-id',
					admin: true,
					app: true,
					ip: null,
				},
				get: () => undefined,
				protocol: 'https',
			},
			response,
			middlewareNext,
		)
		await vi.waitFor(() => expect(middlewareNext).toHaveBeenCalledOnce())
		expect(response.setHeader).toHaveBeenCalledWith(
			'X-Coolify-Deployments-Poll-Interval',
			'3000',
		)
		expect(response.setHeader).toHaveBeenCalledWith(
			'X-Coolify-Deployments-Applications-Collection',
			'deployment_targets',
		)

		const permissionRoute = router.get.mock.calls[0]?.[2]
		if (typeof permissionRoute !== 'function') throw new Error('Expected permission route')
		permissionRoute({}, response, vi.fn())
		expect(response.json).toHaveBeenCalledWith({ canTrigger: true })
	})

	it('normalizes configured applications and maps provider failures to an upstream error', async () => {
		mocks.client.listConfiguredApplication.mockResolvedValueOnce([
			{
				id: 'frontend',
				name: 'Frontend',
				application_uuid: 'application-1',
				project_uuid: null,
				project_name: 'Project',
				environment_uuid: null,
				environment_name: 'Production',
				production_url: null,
				enabled: true,
				deploy_enabled: true,
			},
		])
		mocks.client.getApplication.mockResolvedValueOnce({
			uuid: 'application-1',
			name: 'Provider frontend',
			fqdn: 'https://frontend.test',
			status: 'running',
			environmentId: null,
			gitBranch: 'main',
			gitCommitSha: 'abc',
			gitRepository: null,
			buildPack: null,
			serverName: null,
		})
		const router = createRouter()
		runEndpoint(router)
		const route = router.get.mock.calls[1]?.[2]
		if (typeof route !== 'function') throw new Error('Expected applications route')
		const response = createResponse()
		route({}, response, vi.fn())
		await vi.waitFor(() => expect(response.json).toHaveBeenCalled())
		expect(response.json).toHaveBeenCalledWith([
			expect.objectContaining({ id: 'frontend', state: 'running' }),
		])

		mocks.client.getApplication.mockRejectedValueOnce(new Error('Coolify unavailable'))
		mocks.client.listConfiguredApplication.mockResolvedValueOnce([
			{
				id: 'frontend',
				name: 'Frontend',
				application_uuid: 'application-1',
				project_uuid: null,
				project_name: 'Project',
				environment_uuid: null,
				environment_name: 'Production',
				production_url: null,
				enabled: true,
				deploy_enabled: true,
			},
		])
		const failed = createResponse()
		const next = vi.fn()
		route({}, failed, next)
		await vi.waitFor(() => expect(next).toHaveBeenCalled())
		expect(next).toHaveBeenCalledWith(expect.any(Error))
	})

	it('serves deployment detail, trigger, and cancellation routes', async () => {
		mocks.client.getConfiguredApplication.mockResolvedValue({
			id: 'frontend',
			name: 'Frontend',
			application_uuid: 'application-1',
			project_uuid: 'project-1',
			project_name: 'Project',
			environment_uuid: 'environment-1',
			environment_name: 'Production',
			production_url: null,
			enabled: true,
			deploy_enabled: true,
		})
		mocks.client.getDeployment.mockResolvedValue({
			applicationId: 'application-1',
			applicationUuid: 'application-1',
			deploymentUuid: 'deployment-1',
			status: 'finished',
		})
		mocks.client.deploy.mockResolvedValue([
			{ deploymentUuid: 'deployment-2', message: 'queued' },
		])
		mocks.client.cancelDeployment.mockResolvedValue({
			deploymentUuid: 'deployment-1',
			message: 'cancelled',
			status: 'cancelled-by-user',
		})
		mocks.client.listConfiguredApplication.mockResolvedValue([
			{
				id: 'frontend',
				name: 'Frontend',
				application_uuid: 'application-1',
				project_uuid: 'project-1',
				project_name: 'Project',
				environment_uuid: 'environment-1',
				environment_name: 'Production',
				production_url: null,
				enabled: true,
				deploy_enabled: true,
			},
		])
		const router = createRouter()
		runEndpoint(router)
		const request = { params: { id: 'frontend', deploymentId: 'deployment-1' } }

		const detailResponse = createResponse()
		const detailRoute = router.get.mock.calls[3]?.[2]
		if (typeof detailRoute !== 'function') throw new Error('Expected detail route')
		await detailRoute(request, detailResponse, vi.fn())
		await vi.waitFor(() =>
			expect(detailResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'deployment-1', applicationName: 'Frontend' }),
			),
		)

		const deployResponse = createResponse()
		const deployRoute = router.post.mock.calls[0]?.[2]
		if (typeof deployRoute !== 'function') throw new Error('Expected deploy route')
		await deployRoute(request, deployResponse, vi.fn())
		await vi.waitFor(() => expect(deployResponse.json).toHaveBeenCalled())
		expect(mocks.client.deploy).toHaveBeenCalledWith({ uuid: 'application-1', force: true })
		expect(deployResponse.status).toHaveBeenCalledWith(201)
		expect(deployResponse.json).toHaveBeenCalledWith({ id: 'deployment-2' })

		const cancelResponse = createResponse()
		const cancelRoute = router.post.mock.calls[1]?.[2]
		if (typeof cancelRoute !== 'function') throw new Error('Expected cancel route')
		await cancelRoute(request, cancelResponse, vi.fn())
		await vi.waitFor(() => expect(cancelResponse.json).toHaveBeenCalled())
		expect(mocks.client.cancelDeployment).toHaveBeenCalledWith('deployment-1')
		expect(cancelResponse.json).toHaveBeenCalledWith(
			expect.objectContaining({ deploymentUuid: 'deployment-1' }),
		)
	})

	it('normalizes an empty deployment trigger result as an upstream failure', async () => {
		mocks.client.getConfiguredApplication.mockResolvedValue({
			id: 'frontend',
			name: 'Frontend',
			application_uuid: 'application-1',
			project_uuid: null,
			project_name: null,
			environment_uuid: null,
			environment_name: null,
			production_url: null,
			enabled: true,
			deploy_enabled: true,
		})
		mocks.client.listConfiguredApplication.mockResolvedValue([
			{
				id: 'frontend',
				name: 'Frontend',
				application_uuid: 'application-1',
				project_uuid: null,
				project_name: null,
				environment_uuid: null,
				environment_name: null,
				production_url: null,
				enabled: true,
				deploy_enabled: true,
			},
		])
		mocks.client.deploy.mockResolvedValue([])
		const router = createRouter()
		runEndpoint(router)
		const response = createResponse()
		const next = vi.fn()
		const deployRoute = router.post.mock.calls[0]?.[2]
		if (typeof deployRoute !== 'function') throw new Error('Expected deploy route')
		await deployRoute({ params: { id: 'frontend' } }, response, next)
		await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.any(Error)))
	})
})
