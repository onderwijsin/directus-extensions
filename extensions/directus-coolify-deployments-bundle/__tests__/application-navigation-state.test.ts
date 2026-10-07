import type { ApplicationSummary } from '../src/coolify-deployments-module/types'

import { describe, expect, it, vi } from 'vitest'

import { createApplicationNavigation } from '../src/coolify-deployments-module/composables/useApplicationNavigation'

const application: ApplicationSummary = {
	directusApplicationId: 'app-1',
	name: 'Frontend',
	url: null,
	projectName: null,
	environmentName: null,
	state: null,
	gitBranch: null,
	gitCommitSha: null,
	gitRepository: null,
	buildPack: null,
	serverName: null,
	latestDeployment: null,
}

describe('shared application navigation', () => {
	it('deduplicates requests and reuses a successfully loaded empty list', async () => {
		const load = vi.fn<() => Promise<ApplicationSummary[]>>().mockResolvedValue([])
		const navigation = createApplicationNavigation(load)
		await Promise.all([navigation.ensureApplications(), navigation.ensureApplications()])
		await navigation.ensureApplications()
		expect(load).toHaveBeenCalledTimes(1)
	})

	it('reuses dashboard applications without an extra list request', async () => {
		const load = vi.fn<() => Promise<ApplicationSummary[]>>().mockResolvedValue([])
		const navigation = createApplicationNavigation(load)
		navigation.updateApplications([application])
		await navigation.ensureApplications()
		expect(navigation.applications.value).toEqual([application])
		expect(load).not.toHaveBeenCalled()
	})

	it('allows a failed request to be retried', async () => {
		const load = vi
			.fn<() => Promise<ApplicationSummary[]>>()
			.mockRejectedValueOnce(new Error('Unavailable'))
			.mockResolvedValueOnce([application])
		const navigation = createApplicationNavigation(load)
		await expect(navigation.ensureApplications()).rejects.toThrow('Unavailable')
		await navigation.ensureApplications()
		expect(navigation.applications.value).toEqual([application])
		expect(load).toHaveBeenCalledTimes(2)
	})

	it('keeps a newer dashboard response when an older list request completes', async () => {
		let resolveRequest: ((applications: ApplicationSummary[]) => void) | undefined
		const navigation = createApplicationNavigation(
			() =>
				new Promise((resolve) => {
					resolveRequest = resolve
				}),
		)
		const pending = navigation.ensureApplications()
		navigation.updateApplications([application])
		resolveRequest?.([])
		await pending
		expect(navigation.applications.value).toEqual([application])
	})
})
