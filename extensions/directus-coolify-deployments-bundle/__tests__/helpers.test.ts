import type { CoolifyDeployment } from '../src/shared/coolify-client/schemas'

import { describe, expect, it } from 'vitest'

import { normalizeDeployment } from '../src/coolify-deployments-endpoint/helpers'

const deployment = (status: string, overrides: Partial<CoolifyDeployment> = {}) => ({
	applicationId: 'application-1',
	applicationUuid: 'application-1',
	commit: null,
	commitMessage: null,
	createdAt: '2026-08-20T10:00:00Z',
	deploymentUrl: '/deployment/1',
	deploymentUuid: 'deployment-1',
	finishedAt: '2026-08-20T10:01:05Z',
	forceRebuild: null,
	id: null,
	pullRequestId: null,
	status,
	updatedAt: null,
	...overrides,
})

describe('normalizeDeployment', () => {
	it.each([
		['queued', 'queued'],
		['pending', 'queued'],
		['running', 'building'],
		['building:running', 'building'],
		['in_progress', 'building'],
		['success', 'ready'],
		['finished', 'ready'],
		['cancelled', 'canceled'],
		['failed', 'error'],
		['something-new', 'queued'],
	] as const)('maps provider status %s to %s', (status, expected) => {
		expect(
			normalizeDeployment(deployment(status), { COOLIFY_URL: 'https://coolify.test' }),
		).toMatchObject({
			status: expected,
			rawStatus: status,
		})
	})

	it('normalizes relative URLs and computes a non-negative duration', () => {
		const result = normalizeDeployment(
			deployment('finished', {
				commit: 'abc123',
				commitMessage: 'Deploy',
				createdAt: '2026-08-20T10:01:05Z',
				finishedAt: '2026-08-20T10:00:00Z',
			}),
			{ COOLIFY_URL: 'https://coolify.test/' },
		)

		expect(result.url).toBe('https://coolify.test/deployment/1')
		expect(result.coolifyUrl).toBe(result.url)
		expect(result.duration).toBe(0)
		expect(result.commitSha).toBe('abc123')
	})

	it('keeps absent URLs and incomplete timing nullable', () => {
		const result = normalizeDeployment(
			deployment('running', { deploymentUrl: null, createdAt: null, finishedAt: null }),
			{ COOLIFY_URL: 'https://coolify.test' },
		)

		expect(result.url).toBeNull()
		expect(result.coolifyUrl).toBeNull()
		expect(result.duration).toBeNull()
	})
})
