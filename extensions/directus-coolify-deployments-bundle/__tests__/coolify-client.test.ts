import { describe, expect, it, vi } from 'vitest'

import { createCoolifyDeploymentClient } from '../src/shared/coolify-client'
import { envSchema } from '../src/shared/schemas'

const options = envSchema.parse({
	COOLIFY_URL: 'https://coolify.example.com/',
	COOLIFY_TOKEN: 'token',
	COOLIFY_PROJECTS: [
		{
			id: 'frontend',
			name: 'Frontend',
			productionUrl: null,
			resourceUuid: 'resource-uuid',
		},
	],
})

describe('Coolify deployment client', () => {
	it('keeps configured Coolify UUIDs out of the public project list', () => {
		expect(createCoolifyDeploymentClient(options).listProjects()).toEqual([
			{ id: 'frontend', name: 'Frontend', productionUrl: null },
		])
	})

	it('lists and normalizes application deployments', async () => {
		const fetchImplementation = vi.fn<typeof fetch>((input, init) => {
			expect(input).toBe(
				'https://coolify.example.com/api/v1/deployments/applications/resource-uuid?skip=5&take=20',
			)
			expect(init?.headers).toMatchObject({ Authorization: 'Bearer token' })

			return Promise.resolve(
				new Response(
					JSON.stringify([
						{
							application_id: 'resource-uuid',
							commit: 'abc123',
							commit_message: 'Update content',
							created_at: '2026-08-19T10:00:00Z',
							deployment_url: 'https://preview.example.com',
							deployment_uuid: 'deployment-1',
							status: 'finished',
							updated_at: '2026-08-19T10:01:00Z',
						},
					]),
					{ status: 200 },
				),
			)
		})

		expect(
			await createCoolifyDeploymentClient(options, fetchImplementation).listDeployments(
				options.COOLIFY_PROJECTS[0]!,
				{ skip: 5, take: 20 },
			),
		).toEqual([
			{
				duration: 60_000,
				commitMessage: 'Update content',
				commitSha: 'abc123',
				deploymentUrl: 'https://preview.example.com',
				finishedAt: '2026-08-19T10:01:00Z',
				id: 'deployment-1',
				projectId: 'frontend',
				rawStatus: 'finished',
				startedAt: '2026-08-19T10:00:00Z',
				status: 'success',
			},
		])
	})

	it('uses Coolify deploy with the configured resource UUID and force flag', async () => {
		const fetchImplementation = vi.fn<typeof fetch>((input) => {
			expect(input).toBe(
				'https://coolify.example.com/api/v1/deploy?force=true&uuid=resource-uuid',
			)
			return Promise.resolve(
				new Response(
					JSON.stringify({
						deployments: [
							{
								deployment_uuid: 'deployment-2',
								message: 'Deployment queued',
								resource_uuid: 'resource-uuid',
							},
						],
					}),
					{ status: 200 },
				),
			)
		})

		await expect(
			createCoolifyDeploymentClient(options, fetchImplementation).deploy(
				options.COOLIFY_PROJECTS[0]!,
				true,
			),
		).resolves.toMatchObject({
			id: 'deployment-2',
			projectId: 'frontend',
			status: 'unknown',
		})
	})
})
