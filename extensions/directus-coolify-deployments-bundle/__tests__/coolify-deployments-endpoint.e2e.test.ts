import { describe, expect, it } from 'vitest'

import { createDirectusE2EClient, customEndpoint } from '../../../packages/test-utils/src'
import {
	DEFAULT_MANAGE_APPLICATIONS_POLICY_ID,
	DEFAULT_READ_DEPLOYMENTS_POLICY_ID,
	DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID,
} from '../src/shared/constants'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN

if (!baseUrl || !token) {
	throw new Error('DIRECTUS_E2E_URL and DIRECTUS_E2E_TOKEN are required for endpoint E2E tests')
}

const client = createDirectusE2EClient({
	baseUrl,
	token,
	composeFiles: JSON.parse(process.env.DIRECTUS_E2E_COMPOSE_FILES ?? '[]') as string[],
	composeProject: process.env.DIRECTUS_E2E_COMPOSE_PROJECT ?? '',
})

const policyApplicationUuid = 'e2e-policy-coolify-application'
const routeApplicationUuid = 'e2e-route-coolify-application'

const requestStatus = async (request: () => Promise<unknown>): Promise<number> => {
	try {
		await request()
	} catch (error: unknown) {
		if (typeof error === 'object' && error !== null && 'response' in error) {
			const response = error.response
			if (response instanceof Response) return response.status
		}
		throw error
	}

	throw new Error('Expected the request to fail')
}

const requestRaw = async (
	userClient: { getToken(): Promise<string | null> },
	path: string,
): Promise<unknown> => {
	const userToken = await userClient.getToken()
	if (!userToken) throw new Error('Expected the E2E user client to have an access token')
	const response = await fetch(`${baseUrl}${path}`, {
		headers: { Authorization: `Bearer ${userToken}` },
	})
	if (!response.ok) throw new Error(`Directus ${response.status}: ${await response.text()}`)
	return response.json()
}

const assignPolicy = async (user: string, policy: string): Promise<void> => {
	await client.request(
		customEndpoint({
			path: '/access',
			method: 'POST',
			body: JSON.stringify([{ user, policy }]),
		}),
	)
}

const createApplication = async (
	applicationUuid = policyApplicationUuid,
): Promise<string | number> => {
	const item = await client.request(
		customEndpoint({
			path: '/items/coolify_applications',
			method: 'POST',
			body: JSON.stringify({ application_uuid: applicationUuid }),
		}),
	)
	if (typeof item !== 'object' || item === null || !('id' in item))
		throw new Error('Expected the created Coolify application to have an ID')
	if (typeof item.id !== 'string' && typeof item.id !== 'number')
		throw new Error('Expected the created Coolify application ID to be scalar')
	await client.request(customEndpoint({ path: '/utils/cache/clear', method: 'POST', body: '{}' }))
	return item.id
}

const deleteApplication = async (id: string | number): Promise<void> => {
	await client.request(
		customEndpoint({
			path: `/items/coolify_applications/${encodeURIComponent(String(id))}`,
			method: 'DELETE',
		}),
	)
}

describe('Coolify deployment endpoint', () => {
	it('rejects unauthenticated requests', async () => {
		const response = await fetch(`${baseUrl}/coolify-deployments/applications`)

		expect(response.status).toBe(403)
	})

	it('rejects authenticated cross-origin requests', async () => {
		const response = await fetch(`${baseUrl}/coolify-deployments/applications`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Origin: 'https://evil.example.com',
			},
		})

		expect(response.status).toBe(403)
	})

	it('allows authenticated same-origin requests to reach the route', async () => {
		// This route is intentionally provider-independent. Every test that exercises
		// a Coolify API operation uses mocked ofetch responses in the unit suite; the
		// E2E stack must never depend on a live Coolify instance.
		const response = await fetch(`${baseUrl}/coolify-deployments/permissions`, {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ canTrigger: true })
	})

	it('loads the built bundle schema through Directus', async () => {
		const response = await fetch(`${baseUrl}/collections/coolify_applications`, {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(response.status).toBe(200)
		expect((await response.json()).data.collection).toBe('coolify_applications')
	})

	it('enriches an application and exercises deployment routes through Directus', async () => {
		const item = await client.request(
			customEndpoint({
				path: '/items/coolify_applications',
				method: 'POST',
				body: JSON.stringify({ application_uuid: 'e2e-coolify-application' }),
			}),
		)
		if (typeof item !== 'object' || item === null || !('id' in item))
			throw new Error('Expected the created Coolify application to have an ID')
		const itemId = item.id
		if (typeof itemId !== 'string' && typeof itemId !== 'number')
			throw new Error('Expected the created Coolify application ID to be scalar')
		try {
			const applications = await client.request(
				customEndpoint({ path: '/coolify-deployments/applications', method: 'GET' }),
			)
			expect(applications).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						directusApplicationId: itemId,
						name: 'E2E Coolify application',
					}),
				]),
			)

			const deployment = await client.request(
				customEndpoint({
					path: `/coolify-deployments/applications/${encodeURIComponent(itemId)}/deployments`,
					method: 'POST',
					body: '{}',
				}),
			)
			expect(deployment).toEqual({ id: 'e2e-deployment-1' })

			const detail = await client.request(
				customEndpoint({
					path: `/coolify-deployments/applications/${encodeURIComponent(itemId)}/deployments/e2e-deployment-1`,
					method: 'GET',
				}),
			)
			expect(detail).toEqual(
				expect.objectContaining({
					id: 'e2e-deployment-1',
					directusApplicationId: itemId,
					coolifyApplicationId: 'e2e-coolify-application',
				}),
			)

			const cancellation = await client.request(
				customEndpoint({
					path: `/coolify-deployments/applications/${encodeURIComponent(itemId)}/deployments/e2e-deployment-1/cancel`,
					method: 'POST',
				}),
			)
			expect(cancellation).toEqual(
				expect.objectContaining({ deploymentUuid: 'e2e-deployment-1' }),
			)
		} finally {
			await client.request(
				customEndpoint({
					path: `/items/coolify_applications/${encodeURIComponent(String(itemId))}`,
					method: 'DELETE',
				}),
			)
		}
	})

	it('rejects an authenticated user without the route policy', async () => {
		const user = await client.createEphemeralUser({
			role: {
				name: 'Coolify no-policy role',
				policies: [{ name: 'Coolify API role' }],
			},
		})
		try {
			const status = await client.withUserContext(user.id, (userClient) =>
				requestStatus(() =>
					userClient.request(
						customEndpoint({
							path: '/coolify-deployments/applications',
							method: 'GET',
						}),
					),
				),
			)
			expect(status).toBe(403)

			await client.request(
				customEndpoint({
					path: '/access',
					method: 'POST',
					body: JSON.stringify([
						{ user: user.id, policy: DEFAULT_MANAGE_APPLICATIONS_POLICY_ID },
					]),
				}),
			)
			await expect(
				client.withUserContext(user.id, (userClient) =>
					userClient.request(
						customEndpoint({
							path: '/coolify-deployments/applications',
							method: 'GET',
						}),
					),
				),
			).resolves.toBeInstanceOf(Array)
		} finally {
			await user.dispose()
		}
	})

	it('enforces the seeded manage policy for collection CRUD', async () => {
		const user = await client.createEphemeralUser({
			role: { name: 'Coolify CRUD no-policy role' },
		})
		let rootApplicationId: string | number | undefined
		let managedApplicationId: string | number | undefined

		try {
			rootApplicationId = await createApplication()
			await client.withUserContext(user.id, async (userClient) => {
				for (const request of [
					() =>
						userClient.request(
							customEndpoint({
								path: '/items/coolify_applications',
								method: 'POST',
								body: JSON.stringify({
									application_uuid: policyApplicationUuid,
								}),
							}),
						),
					() =>
						userClient.request(
							customEndpoint({ path: '/items/coolify_applications', method: 'GET' }),
						),
					() =>
						userClient.request(
							customEndpoint({
								path: `/items/coolify_applications/${encodeURIComponent(String(rootApplicationId))}`,
								method: 'PATCH',
								body: JSON.stringify({ enabled: false }),
							}),
						),
					() =>
						userClient.request(
							customEndpoint({
								path: `/items/coolify_applications/${encodeURIComponent(String(rootApplicationId))}`,
								method: 'DELETE',
							}),
						),
				]) {
					expect(await requestStatus(request)).toBe(403)
				}
			})

			await deleteApplication(rootApplicationId)
			rootApplicationId = undefined
			await assignPolicy(user.id, DEFAULT_MANAGE_APPLICATIONS_POLICY_ID)
			await client.withUserContext(user.id, async (userClient) => {
				const created = await userClient.request(
					customEndpoint({
						path: '/items/coolify_applications',
						method: 'POST',
						body: JSON.stringify({ application_uuid: policyApplicationUuid }),
					}),
				)
				if (typeof created !== 'object' || created === null || !('id' in created))
					throw new Error('Expected the managed Coolify application to have an ID')
				if (typeof created.id !== 'string' && typeof created.id !== 'number')
					throw new Error('Expected the managed Coolify application ID to be scalar')
				managedApplicationId = created.id

				expect(
					await userClient.request(
						customEndpoint({ path: '/items/coolify_applications', method: 'GET' }),
					),
				).toEqual(
					expect.arrayContaining([expect.objectContaining({ id: managedApplicationId })]),
				)
				expect(
					await userClient.request(
						customEndpoint({
							path: `/items/coolify_applications/${encodeURIComponent(String(managedApplicationId))}`,
							method: 'PATCH',
							body: JSON.stringify({ enabled: false }),
						}),
					),
				).toEqual(expect.objectContaining({ enabled: false }))
			})
		} finally {
			if (managedApplicationId !== undefined) await deleteApplication(managedApplicationId)
			if (rootApplicationId !== undefined) await deleteApplication(rootApplicationId)
			await user.dispose()
		}
	})

	it('enforces route policies and returns paginated deployment history', async () => {
		const user = await client.createEphemeralUser({
			role: { name: 'Coolify deployment policy role' },
		})
		let directusApplicationId: string | number | undefined

		try {
			directusApplicationId = await createApplication(routeApplicationUuid)
			await client.withUserContext(user.id, async (userClient) => {
				expect(
					await requestStatus(() =>
						userClient.request(
							customEndpoint({
								path: `/coolify-deployments/applications/${encodeURIComponent(String(directusApplicationId))}/deployments`,
								method: 'GET',
							}),
						),
					),
				).toBe(403)
			})
			await assignPolicy(user.id, DEFAULT_READ_DEPLOYMENTS_POLICY_ID)
			await client.withUserContext(user.id, async (userClient) => {
				expect(
					await userClient.request(
						customEndpoint({
							path: '/coolify-deployments/operation/applications',
							method: 'GET',
						}),
					),
				).toEqual(
					expect.arrayContaining([
						{ id: String(directusApplicationId), name: 'E2E Coolify application' },
					]),
				)
				const deploymentPath = `/coolify-deployments/applications/${encodeURIComponent(String(directusApplicationId))}/deployments`
				expect(
					await userClient.request(
						customEndpoint({ path: deploymentPath, method: 'GET' }),
					),
				).toEqual([])
				expect(await requestRaw(userClient, deploymentPath)).toEqual({
					data: [],
					meta: { offset: 0, limit: 10, total: 0, hasMore: false },
				})
			})

			await client.withUserContext(user.id, async (userClient) => {
				expect(
					await requestStatus(() =>
						userClient.request(
							customEndpoint({
								path: '/coolify-deployments/permissions',
								method: 'GET',
							}),
						),
					),
				).toBe(403)
			})
			await assignPolicy(user.id, DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID)
			await client.withUserContext(user.id, async (userClient) => {
				expect(
					await userClient.request(
						customEndpoint({ path: '/coolify-deployments/permissions', method: 'GET' }),
					),
				).toEqual({ canTrigger: true })

				const deployment = await userClient.request(
					customEndpoint({
						path: `/coolify-deployments/applications/${encodeURIComponent(String(directusApplicationId))}/deployments`,
						method: 'POST',
						body: '{}',
					}),
				)
				expect(deployment).toEqual({ id: 'e2e-deployment-1' })
				expect(
					await userClient.request(
						customEndpoint({
							path: `/coolify-deployments/applications/${encodeURIComponent(String(directusApplicationId))}/deployments/e2e-deployment-1/cancel`,
							method: 'POST',
						}),
					),
				).toEqual(expect.objectContaining({ deploymentUuid: 'e2e-deployment-1' }))
			})
		} finally {
			if (directusApplicationId !== undefined) await deleteApplication(directusApplicationId)
			await user.dispose()
		}
	})
})
