import type { Accountability, ApiExtensionContext, SchemaOverview } from '@directus/types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	filterPoliciesByIp,
	fetchPolicies,
	hasPolicies,
	policyAccessFilter,
} from '../src/server/policies'

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

const createServices = (rows: unknown[], roleRows: unknown[] = []) => {
	const readByQuery = vi.fn().mockResolvedValue(rows)
	const readRolesByQuery = vi.fn().mockResolvedValue(roleRows)
	const AccessService = vi.fn(function AccessService() {
		return { readByQuery }
	})
	const ItemsService = vi.fn(function ItemsService() {
		return { readByQuery: readRolesByQuery }
	})

	return {
		services: { AccessService, ItemsService } as unknown as ApiExtensionContext['services'],
		readByQuery,
		readRolesByQuery,
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

describe('filterPoliciesByIp', () => {
	it('keeps unrestricted policies and rejects restricted policies without an IP', () => {
		const rows = [
			{ policy: policy('open'), role: null },
			{ policy: policy('restricted', ['127.0.0.1']), role: null },
		]
		expect(filterPoliciesByIp(rows, null)).toEqual([rows[0]])
	})

	it('keeps policies whose CIDR allow list contains the client IP', () => {
		const rows = [
			{ policy: policy('network', ['192.168.1.0/22']), role: null },
			{ policy: policy('localhost', ['127.0.0.1']), role: null },
		]
		expect(filterPoliciesByIp(rows, '192.168.1.25')).toEqual([rows[0]])
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
			fetchPolicies(accountability({ ip: '127.0.0.1' }), services, schema),
		).resolves.toEqual([
			publicPolicy('parent-policy'),
			publicPolicy('shared-policy'),
			publicPolicy('child-policy'),
			publicPolicy('user-policy'),
		])
		expect(readByQuery).toHaveBeenCalledOnce()
		expect(services.AccessService).toHaveBeenCalledWith({
			accountability: accountability({ ip: '127.0.0.1' }),
			schema,
		})
	})

	it('supports trusted server-side reads without CRUD filtering', async () => {
		const { services } = createServices([{ policy: policy('server-policy'), role: null }])

		await expect(
			fetchPolicies(accountability(), services, schema, null, null),
		).resolves.toEqual([publicPolicy('server-policy')])
		expect(services.AccessService).toHaveBeenCalledWith({ accountability: null, schema })
	})

	it('expands nested roles before resolving policies', async () => {
		const { services, readRolesByQuery } = createServices(
			[{ policy: policy('nested-policy'), role: 'role-child' }],
			[{ id: 'role-child', parent: 'role-root' }],
		)

		await expect(
			fetchPolicies(accountability({ roles: ['role-root'] }), services, schema),
		).resolves.toEqual([publicPolicy('nested-policy')])
		expect(readRolesByQuery).toHaveBeenCalledWith({
			filter: { parent: { _in: ['role-root'] } },
			fields: ['id', 'parent'],
			limit: -1,
		})
	})

	it('checks one or more effective policies', async () => {
		const { services } = createServices([{ policy: policy('allowed'), role: null }])

		await expect(hasPolicies(accountability(), 'allowed', services, schema)).resolves.toBe(true)
		await expect(
			hasPolicies(accountability(), ['allowed', 'missing'], services, schema),
		).resolves.toBe(false)
	})
})
