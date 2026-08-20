import { describe, expect, it } from 'vitest'

import { envSchema as endpointEnvSchema } from '../src/coolify-deployments-endpoint/env.schema'
import {
	coolifyDeploymentRequestSchema,
	coolifyDeploymentsResponseSchema,
	coolifyApplicationSchema,
	coolifyEnvironmentResponseSchema,
	coolifyDeploymentTriggerResponseSchema,
	coolifyDeploymentCancellationSchema,
	envSchema,
} from '../src/shared/coolify-client/schemas'

describe('Coolify deployments schemas', () => {
	it('provides the default Studio polling interval', () => {
		expect(
			endpointEnvSchema.parse({
				COOLIFY_URL: 'https://coolify.example.com',
				COOLIFY_TOKEN: 'token',
			}).COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS,
		).toBe(5000)
	})

	it('accepts a custom Studio polling interval', () => {
		expect(
			endpointEnvSchema.parse({
				COOLIFY_URL: 'https://coolify.example.com',
				COOLIFY_TOKEN: 'token',
				COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS: '5000',
			}).COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS,
		).toBe(5000)
	})

	it('provides the documented environment defaults', () => {
		expect(
			envSchema.parse({ COOLIFY_URL: 'https://coolify.example.com', COOLIFY_TOKEN: 'token' }),
		).toEqual({
			COOLIFY_DEPLOYMENTS_ENABLED: true,
			COOLIFY_APPLICATIONS_COLLECTION: 'coolify_applications',
			COOLIFY_URL: 'https://coolify.example.com',
			COOLIFY_TOKEN: 'token',
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

	it('parses Coolify deployment history responses', () => {
		expect(
			coolifyDeploymentsResponseSchema.parse({
				count: 1,
				deployments: [
					{
						application_id: 'application-1',
						deployment_uuid: 'deployment-1',
						status: 'finished',
					},
				],
			}).deployments,
		).toMatchObject([{ deploymentUuid: 'deployment-1' }])
	})

	it('requires Redis configuration for the Redis cache store', () => {
		const base = { COOLIFY_URL: 'https://coolify.example.com', COOLIFY_TOKEN: 'token' }
		expect(endpointEnvSchema.safeParse({ ...base, CACHE_STORE: 'memory' }).success).toBe(true)
		expect(endpointEnvSchema.safeParse({ ...base, CACHE_STORE: 'redis' }).success).toBe(false)
		expect(
			endpointEnvSchema.safeParse({
				...base,
				CACHE_STORE: 'redis',
				REDIS: 'redis://localhost',
			}).success,
		).toBe(true)
		expect(
			endpointEnvSchema.safeParse({
				...base,
				CACHE_STORE: 'redis',
				REDIS_ENABLED: true,
				REDIS_HOST: 'cache',
				REDIS_PORT: 6379,
				REDIS_USERNAME: 'default',
				REDIS_PASSWORD: 'secret',
			}).success,
		).toBe(true)
	})

	it('restricts deployment requests to one application UUID', () => {
		expect(() =>
			coolifyDeploymentRequestSchema.parse({ uuid: 'application-1,application-2' }),
		).toThrow()
		expect(() =>
			coolifyDeploymentRequestSchema.parse({ uuid: 'application-1', tag: 'production' }),
		).toThrow()
		expect(() =>
			coolifyDeploymentRequestSchema.parse({ uuid: 'application-1', pr: 42 }),
		).toThrow()
	})

	it('rejects unsafe collection names and blank filters', () => {
		expect(() =>
			envSchema.parse({
				COOLIFY_URL: 'https://coolify.test',
				COOLIFY_TOKEN: 'token',
				COOLIFY_APPLICATIONS_COLLECTION: 'directus_users',
			}),
		).toThrow()
		expect(() =>
			envSchema.parse({
				COOLIFY_URL: 'https://coolify.test',
				COOLIFY_TOKEN: 'token',
				COOLIFY_APPLICATIONS_COLLECTION: 'bad-name',
			}),
		).toThrow()
	})

	it('normalizes optional provider fields to stable nulls', () => {
		expect(coolifyApplicationSchema.parse({ uuid: 'app-1', name: 'App' })).toEqual({
			uuid: 'app-1',
			name: 'App',
			fqdn: null,
			status: null,
			environmentId: null,
			environmentUuid: null,
			environmentName: null,
			projectUuid: null,
			projectName: null,
			gitBranch: null,
			gitCommitSha: null,
			gitRepository: null,
			buildPack: null,
			serverName: null,
		})
		expect(coolifyEnvironmentResponseSchema.parse({ id: 1, name: 'production' })).toMatchObject(
			{ uuid: null, projectId: null, description: null },
		)
	})

	it('rejects malformed trigger, cancellation, and pagination payloads', () => {
		expect(() =>
			coolifyDeploymentTriggerResponseSchema.parse({ deployments: [{ message: 'queued' }] }),
		).toThrow()
		expect(() =>
			coolifyDeploymentCancellationSchema.parse({
				message: 'cancelled',
				deployment_uuid: 'd',
			}),
		).toThrow()
	})
})
