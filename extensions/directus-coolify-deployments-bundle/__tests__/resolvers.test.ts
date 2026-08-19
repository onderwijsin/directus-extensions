import type { DirectusCoolifyApplication } from '../src/shared/coolify-client/types'

import { describe, expect, it, vi } from 'vitest'

import {
	getAllowedApplications,
	getAllowedEnvirnoments,
	getAllowedProjects,
} from '../src/shared/coolify-client/resolvers'

const applications: DirectusCoolifyApplication[] = [
	{
		id: 'one',
		name: 'One',
		application_uuid: 'application-1',
		project_uuid: 'project-1',
		project_name: 'Project',
		environment_uuid: 'environment-1',
		environment_name: 'Production',
		production_url: null,
		enabled: true,
		deploy_enabled: true,
	},
	{
		id: 'two',
		name: 'Two',
		application_uuid: 'application-1',
		project_uuid: 'project-1',
		project_name: 'Project',
		environment_uuid: null,
		environment_name: null,
		production_url: null,
		enabled: true,
		deploy_enabled: true,
	},
]

describe('Coolify allow-list resolvers', () => {
	it('returns unique allowed application UUIDs', async () => {
		const listConfiguredApplication = vi.fn(() => Promise.resolve(applications))

		expect(await getAllowedApplications(listConfiguredApplication)).toEqual(['application-1'])
		expect(listConfiguredApplication).toHaveBeenCalledOnce()
	})

	it('returns unique allowed project UUIDs', async () => {
		expect(await getAllowedProjects(() => Promise.resolve(applications))).toEqual(['project-1'])
	})

	it('returns unique non-null environment UUIDs', async () => {
		expect(await getAllowedEnvirnoments(() => Promise.resolve(applications))).toEqual([
			'environment-1',
		])
	})
})
