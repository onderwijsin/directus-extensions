import type { DeploymentSummary } from '../src/coolify-deployments-module/types'

import { describe, expect, it } from 'vitest'

import {
	deploymentPath,
	deploymentSummaryPath,
	formatDate,
	formatDuration,
	repositoryUrl,
} from '../src/coolify-deployments-module/utils'

describe('Coolify module utilities', () => {
	it('encodes application and deployment route segments', () => {
		expect(deploymentPath('app/one')).toBe('/coolify-deployments/applications/app%2Fone')
		expect(deploymentPath('app/one', 'deployment two')).toBe(
			'/coolify-deployments/applications/app%2Fone/deployments/deployment%20two',
		)
		expect(
			deploymentSummaryPath({
				directusApplicationId: 'app/one',
				coolifyApplicationId: 'coolify-app-one',
				id: 'deployment two',
				status: 'queued',
				rawStatus: 'queued',
				createdAt: null,
				startedAt: null,
				finishedAt: null,
				duration: null,
				branch: null,
				commitSha: null,
				commitMessage: null,
				url: null,
				coolifyUrl: null,
				triggeredBy: null,
			} satisfies DeploymentSummary),
		).toContain('deployment%20two')
	})

	it('formats durations at the minute boundary and preserves nulls', () => {
		expect(formatDuration(null)).toBe('—')
		expect(formatDuration(60)).toBe('60s')
		expect(formatDuration(61)).toBe('1m')
		expect(formatDuration(119)).toBe('2m')
	})

	it('builds repository links only for non-empty values', () => {
		expect(repositoryUrl(null)).toBeNull()
		expect(repositoryUrl('')).toBeNull()
		expect(repositoryUrl('onderwijsin/project')).toBe('https://github.com/onderwijsin/project')
		expect(repositoryUrl('https://git.example/project')).toBe('https://git.example/project')
	})

	it('formats valid dates and uses an em dash for missing dates', () => {
		expect(formatDate(null)).toBe('—')
		expect(formatDate('2026-08-20T10:00:00Z')).not.toBe('—')
	})
})
