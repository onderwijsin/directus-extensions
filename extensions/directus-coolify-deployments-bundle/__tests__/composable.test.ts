import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))

vi.mock('@directus/extensions-sdk', () => ({ useApi: () => mocks.api }))

import { useCoolifyDeploymentsApi } from '../src/coolify-deployments-module/composables/useCoolifyDeploymentsApi'

describe('useCoolifyDeploymentsApi', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('calls the expected encoded routes and forwards deployment options', async () => {
		mocks.api.get
			.mockResolvedValueOnce({
				data: [{ directusApplicationId: 'app/1' }],
				headers: { 'x-coolify-deployments-poll-interval': '249' },
			})
			.mockResolvedValueOnce({
				data: {
					data: [{ id: 'deployment 1' }],
					meta: { offset: 0, limit: 10, total: 1, hasMore: false },
				},
				headers: {},
			})
			.mockResolvedValueOnce({ data: { id: 'deployment 1' }, headers: {} })
		mocks.api.post.mockResolvedValueOnce({ data: { id: 'created' } }).mockResolvedValueOnce({})
		const api = useCoolifyDeploymentsApi()

		await expect(api.listApplications()).resolves.toEqual([{ directusApplicationId: 'app/1' }])
		await expect(api.listDeployments('app/1')).resolves.toEqual({
			data: [{ id: 'deployment 1' }],
			meta: { offset: 0, limit: 10, total: 1, hasMore: false },
		})
		await expect(api.getDeployment('app/1', 'deployment 1')).resolves.toEqual({
			id: 'deployment 1',
		})
		await expect(api.deploy('app/1')).resolves.toBe('created')
		await api.cancelDeployment('app/1', 'deployment 1')

		expect(mocks.api.get).toHaveBeenNthCalledWith(1, '/coolify-deployments/applications')
		expect(mocks.api.get).toHaveBeenNthCalledWith(
			2,
			'/coolify-deployments/applications/app%2F1/deployments?offset=0&limit=10',
		)

		mocks.api.get.mockResolvedValueOnce({
			data: {
				data: [],
				meta: { offset: 10, limit: 10, total: 11, hasMore: false },
			},
			headers: {},
		})
		await expect(
			api.listDeployments('app/1', { offset: 10, limit: 10 }),
		).resolves.toMatchObject({
			meta: { offset: 10 },
		})
		expect(mocks.api.get).toHaveBeenNthCalledWith(
			4,
			'/coolify-deployments/applications/app%2F1/deployments?offset=10&limit=10',
		)
		expect(mocks.api.get).toHaveBeenNthCalledWith(
			3,
			'/coolify-deployments/applications/app%2F1/deployments/deployment%201',
		)
		expect(mocks.api.post).toHaveBeenNthCalledWith(
			1,
			'/coolify-deployments/applications/app%2F1/deployments',
			{ force: true },
		)
		expect(mocks.api.post).toHaveBeenNthCalledWith(
			2,
			'/coolify-deployments/applications/app%2F1/deployments/deployment%201/cancel',
		)
	})

	it('interprets permission responses and safely denies failed checks', async () => {
		mocks.api.get
			.mockResolvedValueOnce({
				data: { data: { coolify_applications: { create: { access: 'partial' } } } },
			})
			.mockResolvedValueOnce({ data: { canTrigger: true } })
		const api = useCoolifyDeploymentsApi()

		await expect(api.canCreateApplications()).resolves.toBe(true)
		await expect(api.canTriggerDeployments()).resolves.toBe(true)

		mocks.api.get.mockRejectedValueOnce(new Error('permission service unavailable'))
		await expect(api.canCreateApplications()).resolves.toBe(false)
	})

	it('ignores invalid polling headers and accepts the documented lower bound', async () => {
		const api = useCoolifyDeploymentsApi()
		mocks.api.get.mockResolvedValueOnce({
			data: [],
			headers: { 'x-coolify-deployments-poll-interval': '249' },
		})
		await api.listApplications()
		const initial = api.getPollingInterval()
		mocks.api.get.mockResolvedValueOnce({
			data: [],
			headers: { 'x-coolify-deployments-poll-interval': '250' },
		})
		await api.listApplications()
		expect(initial).toBe(5000)
		expect(api.getPollingInterval()).toBe(250)
	})

	it('loads the dashboard projection for application-view permissions', async () => {
		mocks.api.get.mockResolvedValueOnce({
			data: {
				applications: [],
				current: [],
				recent: [],
				canTriggerDeployments: true,
			},
			headers: {},
		})
		await expect(useCoolifyDeploymentsApi().getDashboard()).resolves.toMatchObject({
			canTriggerDeployments: true,
		})
		expect(mocks.api.get).toHaveBeenCalledWith('/coolify-deployments/dashboard')
	})
})
