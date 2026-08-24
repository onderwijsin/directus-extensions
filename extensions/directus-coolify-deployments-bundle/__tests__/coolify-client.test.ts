import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	ofetch: vi.fn(),
	request: vi.fn<(input: string, options?: unknown) => Promise<unknown>>(),
	initializeCache: vi.fn().mockReturnValue(null),
}))

vi.mock('ofetch', () => ({ ofetch: { create: mocks.ofetch } }))
vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	initializeCache: mocks.initializeCache,
}))

import type {
	CoolifyClientContext,
	DirectusCoolifyApplication,
} from '../src/shared/coolify-client/types'

import { createCoolifyDeploymentClient } from '../src/shared/coolify-client'
import { envSchema } from '../src/shared/coolify-client/schemas'

const options = envSchema.parse({
	COOLIFY_URL: 'https://coolify.example.com/',
	COOLIFY_TOKEN: 'token',
})

const jsonResponse = (body: unknown) => Promise.resolve(body)

const configuredApplications: DirectusCoolifyApplication[] = [
	{
		directusApplicationId: 'configured-application',
		name: 'Configured application',
		application_uuid: 'application-1',
		project_uuid: 'project-1',
		project_name: 'Project',
		environment_uuid: 'environment-1',
		environment_name: 'Production',
		production_url: null,
		enabled: true,
		deploy_enabled: true,
	},
]

const readByQuery = vi.fn((_query?: unknown) =>
	Promise.resolve(
		configuredApplications.map(({ directusApplicationId, ...application }) => ({
			...application,
			id: directusApplicationId,
		})),
	),
)
const itemsServiceOptions = vi.fn()

const context = {
	services: {
		ItemsService: class {
			public constructor(collection: string, serviceOptions: unknown) {
				itemsServiceOptions(collection, serviceOptions)
			}

			public readByQuery(query?: unknown) {
				return readByQuery(query)
			}
		},
	},
	getSchema: vi.fn(() => Promise.resolve({})),
	CACHE_ENABLED: false,
	CACHE_STORE: 'memory',
} as unknown as CoolifyClientContext

const createClient = () => createCoolifyDeploymentClient(options, context)

describe('Coolify deployment client', () => {
	beforeEach(() => {
		mocks.ofetch.mockReset()
		mocks.initializeCache.mockReset()
		mocks.initializeCache.mockReturnValue(null)
		mocks.ofetch.mockReturnValue(mocks.request)
		mocks.request.mockReset()
		readByQuery.mockClear()
		itemsServiceOptions.mockClear()
	})

	it('models project, environment, and application endpoints separately', async () => {
		mocks.request
			.mockImplementationOnce(() =>
				jsonResponse([{ id: 1, uuid: 'project-1', name: 'Frontend' }]),
			)
			.mockImplementationOnce(() =>
				jsonResponse({
					id: 1,
					uuid: 'project-1',
					name: 'Frontend',
					description: 'Web apps',
				}),
			)
			.mockImplementationOnce(() =>
				jsonResponse([{ id: 2, uuid: 'environment-1', name: 'production', project_id: 1 }]),
			)
			.mockImplementationOnce(() =>
				jsonResponse({ id: 2, uuid: 'environment-1', name: 'production', project_id: 1 }),
			)
			.mockImplementationOnce(() =>
				jsonResponse([
					{
						uuid: 'application-1',
						name: 'Frontend',
						environment_id: 2,
						git_branch: 'main',
						git_commit_sha: 'abc123',
					},
				]),
			)
			.mockImplementationOnce(() =>
				jsonResponse({
					uuid: 'application-1',
					name: 'Frontend',
					environment_id: 2,
					git_branch: 'main',
					git_commit_sha: 'abc123',
				}),
			)
		const client = createClient()

		await expect(client.listProjects()).resolves.toEqual([
			{ uuid: 'project-1', name: 'Frontend', description: null },
		])
		await expect(client.getProject('project-1')).resolves.toMatchObject({ uuid: 'project-1' })
		await expect(client.listEnvironments('project-1')).resolves.toEqual([
			{ id: 2, uuid: 'environment-1', name: 'production', projectId: 1, description: null },
		])
		await expect(client.getEnvironment('project-1', 'production')).resolves.toMatchObject({
			name: 'production',
		})
		await expect(client.listApplications({ tag: 'frontend' })).resolves.toEqual([
			{
				uuid: 'application-1',
				name: 'Frontend',
				fqdn: null,
				status: null,
				environmentId: 2,
				environmentUuid: null,
				environmentName: null,
				projectUuid: null,
				projectName: null,
				gitBranch: 'main',
				gitCommitSha: 'abc123',
				gitRepository: null,
				buildPack: null,
				serverName: null,
			},
		])
		await expect(client.getApplication('application-1')).resolves.toMatchObject({
			uuid: 'application-1',
		})

		expect(mocks.ofetch).toHaveBeenCalledWith({
			baseURL: 'https://coolify.example.com/api/v1',
			timeout: 30_000,
			headers: { Authorization: 'Bearer token' },
		})
		expect(mocks.request.mock.calls.map(([input]) => input)).toEqual([
			'/projects',
			'/projects/project-1',
			'/projects/project-1/environments',
			'/projects/project-1/environments/production',
			'/applications',
			'/applications/application-1',
		])
		expect(mocks.request.mock.calls[4]?.[1]).toMatchObject({ query: { tag: 'frontend' } })
	})

	it('reads the configured application collection with bypass accountability', async () => {
		const client = createClient()

		await expect(client.listConfiguredApplication()).resolves.toEqual(configuredApplications)
		expect(readByQuery).toHaveBeenCalledWith({
			limit: -1,
			filter: { enabled: { _eq: true } },
		})
		expect(itemsServiceOptions).toHaveBeenCalledWith(
			'coolify_applications',
			expect.objectContaining({ accountability: null }),
		)
		expect(context.getSchema).toHaveBeenCalled()
	})

	it('can bypass the local allow-list for create-time provider lookups', async () => {
		mocks.request.mockImplementationOnce(() =>
			jsonResponse({ uuid: 'unconfigured-application', name: 'New application' }),
		)
		const client = createClient()

		await expect(
			client.getApplication('unconfigured-application', { bypassAllowList: true }),
		).resolves.toMatchObject({
			uuid: 'unconfigured-application',
		})
		expect(readByQuery).not.toHaveBeenCalled()
	})

	it('reuses the configured application cache', async () => {
		const values = new Map<string, unknown>()
		mocks.initializeCache.mockReturnValue({
			get: vi.fn((key: string) => Promise.resolve(values.get(key))),
			set: vi.fn((key: string, value: unknown) => {
				values.set(key, value)
				return Promise.resolve()
			}),
			delete: vi.fn().mockResolvedValue(undefined),
		})
		const client = createCoolifyDeploymentClient(options, {
			...context,
			CACHE_ENABLED: true,
		})
		expect(mocks.initializeCache).toHaveBeenCalledWith(
			expect.objectContaining({ CACHE_ENABLED: true }),
			{
				ttl: 60_000,
				namespace: 'directus:extensions:coolify-deployments:applications',
			},
		)

		await client.listConfiguredApplication()
		await client.listConfiguredApplication()

		expect(readByQuery).toHaveBeenCalledOnce()
	})

	it('bypasses the configured application cache when requested', async () => {
		const client = createCoolifyDeploymentClient(options, {
			...context,
			CACHE_ENABLED: true,
		})

		await client.listConfiguredApplication()
		await client.listConfiguredApplication({ bypassCache: true })

		expect(readByQuery).toHaveBeenCalledTimes(2)
	})

	it('models deployment history, running deployments, details, and cancellation', async () => {
		const deployment = {
			application: { uuid: 'application-1' },
			application_id: '18',
			commit: 'abc123',
			commit_message: 'Update content',
			created_at: '2026-08-19T10:00:00Z',
			deployment_url: 'https://preview.example.com',
			deployment_uuid: 'deployment-1',
			status: 'finished',
			updated_at: '2026-08-19T10:01:00Z',
		}
		mocks.request
			.mockImplementationOnce(() => jsonResponse({ count: 1, deployments: [deployment] }))
			.mockImplementationOnce(() => jsonResponse([deployment]))
			.mockImplementationOnce(() => jsonResponse(deployment))
			.mockImplementationOnce(() => jsonResponse(deployment))
			.mockImplementationOnce(() =>
				jsonResponse({
					message: 'Deployment cancelled successfully.',
					deployment_uuid: 'deployment-1',
					status: 'cancelled-by-user',
				}),
			)
		const client = createClient()

		await expect(client.listApplicationDeployments('application-1')).resolves.toMatchObject([
			{
				coolifyApplicationId: 'application-1',
				deploymentUuid: 'deployment-1',
			},
		])
		await expect(client.listRunningDeployments()).resolves.toHaveLength(1)
		await expect(client.getDeployment('deployment-1')).resolves.toMatchObject({
			deploymentUuid: 'deployment-1',
		})
		await expect(client.cancelDeployment('deployment-1')).resolves.toEqual({
			message: 'Deployment cancelled successfully.',
			deploymentUuid: 'deployment-1',
			status: 'cancelled-by-user',
		})

		expect(mocks.request.mock.calls.map(([input]) => input)).toEqual([
			'/deployments/applications/application-1',
			'/deployments',
			'/deployments/deployment-1',
			'/deployments/deployment-1',
			'/deployments/deployment-1/cancel',
		])
		expect(mocks.request.mock.calls[4]?.[1]).toMatchObject({ method: 'POST' })
	})

	it('reads only the latest application deployment', async () => {
		mocks.request.mockResolvedValueOnce(
			jsonResponse({
				count: 42,
				deployments: [
					{
						application_id: 'application-1',
						deployment_uuid: 'latest-deployment',
						status: 'running',
					},
				],
			}),
		)

		await expect(
			createClient().getLatestApplicationDeployment('application-1'),
		).resolves.toMatchObject({ deploymentUuid: 'latest-deployment' })
		expect(mocks.request).toHaveBeenCalledWith('/deployments/applications/application-1', {
			query: { skip: 0, take: 1 },
		})
	})

	it('filters list responses and rejects unallow-listed single-record operations', async () => {
		mocks.request.mockImplementationOnce(() =>
			jsonResponse([
				{ id: 1, uuid: 'project-1', name: 'Allowed' },
				{ id: 2, uuid: 'project-2', name: 'Forbidden' },
			]),
		)
		const client = createClient()

		expect(await client.listProjects()).toEqual([
			{ uuid: 'project-1', name: 'Allowed', description: null },
		])
		await expect(client.getProject('project-2')).rejects.toMatchObject({ status: 403 })
		await expect(client.getApplication('application-2')).rejects.toMatchObject({ status: 403 })
		await expect(client.deploy({ uuid: 'application-2' })).rejects.toMatchObject({
			status: 403,
		})
		expect(mocks.request).toHaveBeenCalledOnce()
	})

	it('filters applications, environments, and running deployments', async () => {
		mocks.request
			.mockImplementationOnce(() =>
				jsonResponse([
					{ id: 1, uuid: 'environment-1', name: 'Allowed', project_id: 1 },
					{ id: 2, uuid: 'environment-2', name: 'Forbidden', project_id: 1 },
				]),
			)
			.mockImplementationOnce(() =>
				jsonResponse([
					{ id: 1, uuid: 'application-1', name: 'Allowed' },
					{ id: 2, uuid: 'application-2', name: 'Forbidden' },
				]),
			)
			.mockImplementationOnce(() =>
				jsonResponse([
					{
						application_id: 'application-1',
						deployment_uuid: 'allowed',
						status: 'running',
					},
					{
						application_id: 'application-2',
						deployment_uuid: 'forbidden',
						status: 'running',
					},
				]),
			)
		const client = createClient()

		await expect(client.listEnvironments('project-1')).resolves.toHaveLength(1)
		await expect(client.listApplications()).resolves.toHaveLength(1)
		await expect(client.listRunningDeployments()).resolves.toMatchObject([
			{ coolifyApplicationId: 'application-1' },
		])
	})

	it('preserves upstream request failures', async () => {
		const upstreamError = new Error('Coolify unavailable')
		mocks.request.mockRejectedValueOnce(upstreamError)

		await expect(createClient().listProjects()).rejects.toBe(upstreamError)
	})

	it('fetches application deployments in pages until the final short page', async () => {
		const createDeployment = (index: number) => ({
			application_id: 'application-1',
			deployment_uuid: `deployment-${index}`,
			status: 'finished',
		})
		mocks.request
			.mockImplementationOnce(() =>
				jsonResponse({
					count: 101,
					deployments: Array.from({ length: 100 }, (_, index) => createDeployment(index)),
				}),
			)
			.mockImplementationOnce(() =>
				jsonResponse({ count: 101, deployments: [createDeployment(100)] }),
			)
		const deployments = await createClient().listApplicationDeployments('application-1')

		expect(deployments).toHaveLength(101)
		expect(mocks.request.mock.calls[0]?.[1]).toMatchObject({
			query: { skip: 0, take: 100 },
		})
		expect(mocks.request.mock.calls[1]?.[1]).toMatchObject({
			query: { skip: 100, take: 100 },
		})
	})

	it('deploys one allow-listed application by UUID', async () => {
		mocks.request.mockImplementation(() =>
			jsonResponse({
				deployments: [
					{
						deployment_uuid: 'deployment-2',
						message: 'Deployment queued',
						resource_uuid: 'application-1',
					},
				],
			}),
		)
		const result = await createClient().deploy({
			uuid: 'application-1',
			force: true,
		})

		expect(result).toEqual([
			{
				message: 'Deployment queued',
				resourceUuid: 'application-1',
				deploymentUuid: 'deployment-2',
			},
		])
		expect(mocks.request).toHaveBeenCalledWith('/deploy', {
			method: 'POST',
			query: { uuid: 'application-1', force: true },
		})
	})

	it('rejects deployment mutations when deploy_enabled is false', async () => {
		readByQuery.mockResolvedValue(
			configuredApplications.map(({ directusApplicationId, ...application }) => ({
				...application,
				id: directusApplicationId,
				deploy_enabled: false,
			})),
		)
		const client = createClient()

		await expect(client.deploy({ uuid: 'application-1' })).rejects.toMatchObject({
			status: 403,
		})
		expect(mocks.request).not.toHaveBeenCalled()
	})

	it('rejects cancellation when the configured application cannot be deployed', async () => {
		readByQuery.mockResolvedValue(
			configuredApplications.map(({ directusApplicationId, ...application }) => ({
				...application,
				id: directusApplicationId,
				deploy_enabled: false,
			})),
		)
		mocks.request.mockResolvedValueOnce(
			jsonResponse({
				application_id: 'application-1',
				deployment_uuid: 'deployment-1',
				status: 'running',
			}),
		)

		await expect(createClient().cancelDeployment('deployment-1')).rejects.toMatchObject({
			status: 403,
		})
		expect(mocks.request).toHaveBeenCalledOnce()
	})

	it('requires Directus context for configured application reads', async () => {
		const client = createCoolifyDeploymentClient(options)
		await expect(client.listConfiguredApplication()).rejects.toThrow(
			'Directus context is required to list configured applications',
		)
		await expect(client.getConfiguredApplication('application')).rejects.toThrow(
			'Directus context is required to get configured application',
		)
	})

	it('encodes identifiers before sending provider requests', async () => {
		const configured = configuredApplications[0]
		if (!configured) throw new Error('Expected configured application fixture')
		readByQuery.mockResolvedValue([
			{
				...configured,
				id: configured.directusApplicationId,
				application_uuid: 'application/1',
				project_uuid: 'project/1',
				environment_uuid: 'environment/1',
			},
		])
		mocks.request
			.mockResolvedValueOnce({
				id: 1,
				uuid: 'environment/1',
				name: 'production',
				project_id: 1,
			})
			.mockResolvedValueOnce({ uuid: 'application/1', name: 'Application' })
		const client = createClient()

		await client.getEnvironment('project/1', 'environment/1')
		await client.getApplication('application/1')
		expect(mocks.request.mock.calls.map(([input]) => input)).toEqual([
			'/projects/project%2F1/environments/environment%2F1',
			'/applications/application%2F1',
		])
	})

	it('rejects malformed provider responses before exposing them', async () => {
		mocks.request.mockResolvedValueOnce([{ uuid: 'project-1' }])
		await expect(createClient().listProjects()).rejects.toThrow()
	})

	it('rejects an unallow-listed environment returned by name lookup', async () => {
		mocks.request.mockResolvedValueOnce({
			id: 1,
			uuid: 'environment-2',
			name: 'staging',
			project_id: 1,
		})
		await expect(createClient().getEnvironment('project-1', 'staging')).rejects.toMatchObject({
			status: 403,
		})
	})

	it('rejects an unallow-listed deployment after reading its provider owner', async () => {
		mocks.request.mockResolvedValueOnce({
			application_id: 'application-2',
			deployment_uuid: 'deployment-1',
			status: 'running',
		})
		await expect(createClient().getDeployment('deployment-1')).rejects.toMatchObject({
			status: 403,
		})
		expect(mocks.request).toHaveBeenCalledOnce()
	})
})
