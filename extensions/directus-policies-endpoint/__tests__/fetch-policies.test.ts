import type { Accountability, ApiExtensionContext, SchemaOverview } from '@directus/types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initializePolicyCache } from '../src/cache'
import { fetchPolicies, policyAccessFilter } from '../src/fetch-policies'

const schema = {} as SchemaOverview

const accountability = (overrides: Partial<Accountability> = {}): Accountability => ({
	role: 'role-id',
	roles: ['role-a', 'role-b'],
	user: 'user-id',
	admin: true,
	app: true,
	ip: null,
	...overrides,
})

const policy = (id: string, ip_access: string[] | null = null) => ({
	id,
	name: id,
	icon: 'policy',
	description: null,
	enforce_tfa: false,
	admin_access: false,
	app_access: true,
	ip_access,
})

const publicPolicy = (id: string) => {
	const { ip_access: _ipAccess, ...result } = policy(id)
	return result
}

const createServices = (rows: unknown[]) => {
	const readByQuery = vi.fn().mockResolvedValue(rows)
	const AccessService = vi.fn(function AccessService() {
		return { readByQuery }
	})

	return {
		services: { AccessService } as unknown as ApiExtensionContext['services'],
		readByQuery,
	}
}

describe('policyAccessFilter', () => {
	it('includes direct user and role assignments', () => {
		expect(policyAccessFilter(accountability())).toEqual({
			_or: [{ user: { _eq: 'user-id' } }, { role: { _in: ['role-a', 'role-b'] } }],
		})
	})

	it('includes public assignments when no roles exist', () => {
		expect(policyAccessFilter(accountability({ roles: [] }))).toEqual({
			_or: [
				{ user: { _eq: 'user-id' } },
				{ _and: [{ role: { _null: true } }, { user: { _null: true } }] },
			],
		})
	})
})

describe('fetchPolicies', () => {
	beforeEach(() => vi.clearAllMocks())

	it('filters IP access, sorts by priority, and deduplicates policies', async () => {
		const { services, readByQuery } = createServices([
			{ policy: policy('user-policy'), role: null },
			{ policy: policy('parent-policy'), role: 'role-a' },
			{ policy: policy('child-policy'), role: 'role-b' },
			{ policy: policy('blocked-policy', ['192.0.2.0/24']), role: null },
			{ policy: policy('shared-policy'), role: 'role-a' },
			{ policy: policy('shared-policy'), role: null },
		])

		await expect(
			fetchPolicies(accountability({ ip: '127.0.0.1' }), services, schema, null),
		).resolves.toEqual([
			publicPolicy('parent-policy'),
			publicPolicy('child-policy'),
			publicPolicy('shared-policy'),
			publicPolicy('user-policy'),
		])
		expect(readByQuery).toHaveBeenCalledWith({
			filter: {
				_or: [{ user: { _eq: 'user-id' } }, { role: { _in: ['role-a', 'role-b'] } }],
			},
			fields: [
				'policy.id',
				'policy.name',
				'policy.icon',
				'policy.description',
				'policy.enforce_tfa',
				'policy.admin_access',
				'policy.app_access',
				'policy.ip_access',
				'role',
			],
			limit: -1,
		})
	})

	it('caches equivalent accountability lookups', async () => {
		const { services, readByQuery } = createServices([{ policy: policy('cached'), role: null }])
		const cachedAccountability = accountability({ user: 'cached-user' })
		const cache = initializePolicyCache({ CACHE_ENABLED: true, CACHE_STORE: 'memory' })

		await fetchPolicies(cachedAccountability, services, schema, cache)
		await fetchPolicies(cachedAccountability, services, schema, cache)

		expect(readByQuery).toHaveBeenCalledOnce()
	})
})
