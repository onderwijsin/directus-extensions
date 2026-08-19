import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	ofetch: vi.fn(),
	request: vi.fn<(input: string, options?: unknown) => Promise<unknown>>(),
}))

vi.mock('ofetch', () => ({ ofetch: { create: mocks.ofetch } }))

import type {
	CoolifyClientContext,
	DirectusCoolifyApplication,
} from '../src/shared/coolify-client/types'

import { createCoolifyDeploymentClient } from '../src/shared/coolify-client'
import { envSchema } from '../src/shared/coolify-client/schemas'

const options = envSchema.parse({
	COOLIFY_URL: 'https://coolify.example.com/',
	COOLIFY_TOKEN: 'token',
	COOLIFY_PROJECTS: [
		{ id: 'frontend', name: 'Frontend', productionUrl: null, resourceUuid: 'application-uuid' },
	],
})

const jsonResponse = (body: unknown) => Promise.resolve(body)

const configuredApplications: DirectusCoolifyApplication[] = [
	{
		id: 'configured-application',
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

const context = {
	services: {
		ItemsService: class {
			public readMany() {
				return Promise.resolve(configuredApplications)
			}
		},
	},
	getSchema: vi.fn(() => Promise.resolve({})),
	cacheEnabled: false,
	cacheStore: 'memory',
} as unknown as CoolifyClientContext

const createClient = () => createCoolifyDeploymentClient(options, context)

describe('Coolify deployment client', () => {
	beforeEach(() => {
		mocks.ofetch.mockReset()
		mocks.ofetch.mockReturnValue(mocks.request)
		mocks.request.mockReset()
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
					{ id: 3, uuid: 'application-1', name: 'Frontend', environment_id: 2 },
				]),
			)
			.mockImplementationOnce(() =>
				jsonResponse({ id: 3, uuid: 'application-1', name: 'Frontend', environment_id: 2 }),
			)
		const client = createClient()

		await expect(client.listProjects()).resolves.toEqual([
			{ id: 1, uuid: 'project-1', name: 'Frontend', description: null },
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
				id: 3,
				uuid: 'application-1',
				name: 'Frontend',
				fqdn: null,
				status: null,
				environmentId: 2,
			},
		])
		await expect(client.getApplication('application-1')).resolves.toMatchObject({
			uuid: 'application-1',
		})

		expect(mocks.ofetch).toHaveBeenCalledWith({
			baseURL: 'https://coolify.example.com/api/v1',
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

	it('models deployment history, running deployments, details, and cancellation', async () => {
		const deployment = {
			application_id: 'application-1',
			commit: 'abc123',
			commit_message: 'Update content',
			created_at: '2026-08-19T10:00:00Z',
			deployment_url: 'https://preview.example.com',
			deployment_uuid: 'deployment-1',
			status: 'finished',
			updated_at: '2026-08-19T10:01:00Z',
		}
		mocks.request
			.mockImplementationOnce(() => jsonResponse([deployment]))
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
			{ applicationId: 'application-1', deploymentUuid: 'deployment-1' },
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

	it('filters list responses and rejects unallow-listed single-record operations', async () => {
		mocks.request.mockImplementationOnce(() =>
			jsonResponse([
				{ id: 1, uuid: 'project-1', name: 'Allowed' },
				{ id: 2, uuid: 'project-2', name: 'Forbidden' },
			]),
		)
		const client = createClient()

		expect(await client.listProjects()).toEqual([
			{ id: 1, uuid: 'project-1', name: 'Allowed', description: null },
		])
		await expect(client.getProject('project-2')).rejects.toMatchObject({ status: 403 })
		await expect(client.getApplication('application-2')).rejects.toMatchObject({ status: 403 })
		await expect(client.deploy({ uuid: 'application-2' })).rejects.toMatchObject({
			status: 403,
		})
		expect(mocks.request).toHaveBeenCalledOnce()
	})

	it('fetches application deployments in pages until the final short page', async () => {
		const createDeployment = (index: number) => ({
			application_id: 'application-1',
			deployment_uuid: `deployment-${index}`,
			status: 'finished',
		})
		mocks.request
			.mockImplementationOnce(() =>
				jsonResponse(Array.from({ length: 100 }, (_, index) => createDeployment(index))),
			)
			.mockImplementationOnce(() => jsonResponse([createDeployment(100)]))
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
			query: { uuid: 'application-1', force: true },
		})
	})
})
