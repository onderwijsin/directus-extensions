import type { DirectusCoolifyApplication } from '../src/shared/coolify-client'

import { describe, expect, it, vi } from 'vitest'

import {
	loadApplicationSummaries,
	loadApplicationSummary,
} from '../src/coolify-deployments-endpoint/summary'
import {
	coolifyApplicationSchema,
	coolifyDeploymentSchema,
} from '../src/shared/coolify-client/schemas'

const application = (id: string, uuid: string): DirectusCoolifyApplication => ({
	directusApplicationId: id,
	name: '',
	application_uuid: uuid,
	project_uuid: 'project-1',
	project_name: 'Project',
	environment_uuid: 'environment-1',
	environment_name: 'Production',
	production_url: null,
	enabled: true,
	deploy_enabled: true,
})

const providerApplication = (uuid: string, name = 'Provider application') =>
	coolifyApplicationSchema.parse({
		uuid,
		name,
		fqdn: 'https://provider.example',
		status: 'running',
		environment_uuid: 'environment-1',
		environment_name: 'Production',
		project_uuid: 'project-1',
		project_name: 'Project',
		git_branch: 'main',
		git_commit_sha: 'abc123',
		git_repository: 'onderwijsin/example',
		build_pack: 'nixpacks',
		destination: { server: { name: 'server-1' } },
	})

describe('Coolify application summaries', () => {
	it('maps provider metadata and normalizes the latest deployment', async () => {
		const item = {
			...application('directus-1', 'application-1'),
			name: 'Configured application',
			production_url: 'https://configured.example',
		}
		const deployment = coolifyDeploymentSchema.parse({
			application_id: 'application-1',
			deployment_uuid: 'deployment-1',
			status: 'finished',
			created_at: '2026-08-20T10:00:00Z',
			finished_at: '2026-08-20T10:02:00Z',
			deployment_url: '/deployments/deployment-1',
			commit: 'abc123',
			commit_message: 'Deploy application',
		})
		const client = {
			getApplication: vi.fn().mockResolvedValue(providerApplication('application-1')),
			getLatestApplicationDeployment: vi.fn().mockResolvedValue(deployment),
		}

		await expect(
			loadApplicationSummary(client, item, 'https://coolify.example'),
		).resolves.toMatchObject({
			directusApplicationId: 'directus-1',
			name: 'Configured application',
			url: 'https://configured.example',
			state: 'running',
			gitBranch: 'main',
			latestDeployment: {
				id: 'deployment-1',
				status: 'ready',
				url: 'https://coolify.example/deployments/deployment-1',
				duration: 120,
				directusApplicationId: 'directus-1',
			},
		})
		expect(client.getApplication).toHaveBeenCalledWith('application-1')
		expect(client.getLatestApplicationDeployment).toHaveBeenCalledWith('application-1')
	})

	it('falls back to provider URL and returns no deployment when none exists', async () => {
		const client = {
			getApplication: vi.fn().mockResolvedValue(providerApplication('application-1')),
			getLatestApplicationDeployment: vi.fn().mockResolvedValue(null),
		}

		await expect(
			loadApplicationSummary(
				client,
				application('directus-1', 'application-1'),
				'https://coolify.example',
			),
		).resolves.toMatchObject({
			name: 'Provider application',
			url: 'https://provider.example',
			latestDeployment: null,
		})
	})

	it('preserves configuration order while limiting provider reads', async () => {
		const configured = Array.from({ length: 6 }, (_, index) =>
			application(`directus-${index}`, `application-${index}`),
		)
		let active = 0
		let maximumActive = 0
		let releaseGate: () => void = () => undefined
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve
		})
		const client = {
			getApplication: vi.fn(async (uuid: string) => {
				active += 1
				maximumActive = Math.max(maximumActive, active)
				await gate
				active -= 1
				return providerApplication(uuid, uuid)
			}),
			getLatestApplicationDeployment: vi.fn().mockResolvedValue(null),
		}

		const summariesPromise = loadApplicationSummaries(
			client,
			configured,
			'https://coolify.example',
		)
		await Promise.resolve()
		expect(maximumActive).toBe(4)
		releaseGate()

		const summaries = await summariesPromise
		expect(summaries.map(({ directusApplicationId }) => directusApplicationId)).toEqual(
			configured.map(({ directusApplicationId }) => directusApplicationId),
		)
		expect(client.getApplication).toHaveBeenCalledTimes(configured.length)
	})
})
