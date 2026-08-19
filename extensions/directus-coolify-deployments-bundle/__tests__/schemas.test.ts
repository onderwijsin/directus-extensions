import { describe, expect, it } from 'vitest'

import { envSchema, normalizedDeploymentSchema } from '../src/shared/schemas'

describe('Coolify deployments schemas', () => {
	it('provides the documented environment defaults', () => {
		expect(
			envSchema.parse({ COOLIFY_URL: 'https://coolify.example.com', COOLIFY_TOKEN: 'token' }),
		).toEqual({
			COOLIFY_DEPLOYMENTS_ENABLED: true,
			COOLIFY_APPLICATIONS_COLLECTION: 'coolify_applications',
			COOLIFY_URL: 'https://coolify.example.com',
			COOLIFY_TOKEN: 'token',
			COOLIFY_PROJECTS: [],
		})
	})

	it('accepts a custom applications collection name', () => {
		expect(
			envSchema.parse({
				COOLIFY_APPLICATIONS_COLLECTION: 'deployment_targets',
				COOLIFY_URL: 'https://coolify.example.com',
				COOLIFY_TOKEN: 'token',
			}).COOLIFY_APPLICATIONS_COLLECTION,
		).toBe('deployment_targets')
	})

	it('accepts configured projects and normalized deployments', () => {
		expect(
			envSchema.parse({
				COOLIFY_URL: 'https://coolify.example.com/',
				COOLIFY_TOKEN: 'token',
				COOLIFY_PROJECTS: [
					{
						id: 'onderwijsloket',
						name: 'Onderwijsloket',
						productionUrl: 'https://app.example.com',
						resourceUuid: 'resource-uuid',
					},
				],
			}),
		).toMatchObject({ COOLIFY_PROJECTS: [{ id: 'onderwijsloket' }] })

		expect(
			normalizedDeploymentSchema.parse({
				id: 'deployment-1',
				projectId: 'onderwijsloket',
				status: 'queued',
				rawStatus: 'queued',
				commitSha: null,
				commitMessage: null,
				deploymentUrl: null,
				startedAt: null,
				finishedAt: null,
				duration: null,
			}),
		).toMatchObject({ status: 'queued' })
	})

	it('rejects arbitrary project definitions without a resource UUID', () => {
		expect(() =>
			envSchema.parse({
				COOLIFY_URL: 'https://coolify.example.com',
				COOLIFY_TOKEN: 'token',
				COOLIFY_PROJECTS: [{ id: 'frontend', name: 'Frontend' }],
			}),
		).toThrow()
	})
})
