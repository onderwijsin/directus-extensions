import type { Accountability, ApiExtensionContext, SchemaOverview } from '@directus/types'

import { describe, expect, it, vi } from 'vitest'

import { isAssignedPolicy, requirePolicies } from '../src/coolify-deployments-endpoint/auth'

const schema = {} as SchemaOverview

const accountability = (overrides: Partial<Accountability> = {}): Accountability => ({
	role: 'role-id',
	roles: ['role-id', 'parent-role-id'],
	user: 'user-id',
	admin: false,
	app: true,
	ip: null,
	...overrides,
})

const createServices = (rows: unknown[]) => {
	const readByQuery = vi.fn().mockResolvedValue(rows)
	const AccessService = vi.fn(function AccessService() {
		return { readByQuery }
	})
	const ItemsService = vi.fn(function ItemsService() {
		return { readByQuery: vi.fn().mockResolvedValue([]) }
	})
	return {
		services: { AccessService, ItemsService } as unknown as ApiExtensionContext['services'],
		readByQuery,
		AccessService,
	}
}

describe('isAssignedPolicy', () => {
	it('requires every requested policy to be effective', async () => {
		const { services, readByQuery } = createServices([
			{ policy: { id: 'direct-policy' } },
			{ policy: { id: 'role-policy' } },
		])

		expect(
			await isAssignedPolicy(
				accountability(),
				['direct-policy', 'role-policy'],
				services,
				schema,
			),
		).toBe(true)
		expect(
			await isAssignedPolicy(
				accountability(),
				['direct-policy', 'missing-policy'],
				services,
				schema,
			),
		).toBe(false)
		expect(readByQuery).toHaveBeenCalledWith({
			filter: {
				_or: [
					{ user: { _eq: 'user-id' } },
					{ role: { _in: ['role-id', 'parent-role-id'] } },
				],
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

	it('includes public assignments when the accountability has no roles', async () => {
		const { services, readByQuery } = createServices([{ policy: { id: 'public-policy' } }])

		expect(
			await isAssignedPolicy(
				accountability({ roles: [] }),
				'public-policy',
				services,
				schema,
			),
		).toBe(true)
		expect(readByQuery).toHaveBeenCalledWith({
			filter: {
				_or: [
					{ user: { _eq: 'user-id' } },
					{ _and: [{ role: { _null: true } }, { user: { _null: true } }] },
				],
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

	it('does not bypass administrators', async () => {
		const { services, readByQuery } = createServices([])

		expect(
			await isAssignedPolicy(accountability({ admin: true }), 'any-policy', services, schema),
		).toBe(false)
		expect(readByQuery).toHaveBeenCalledOnce()
	})
})

describe('requirePolicies', () => {
	it('accepts multiple policies and requires all of them', async () => {
		const { services } = createServices([
			{ policy: { id: 'first-policy' } },
			{ policy: { id: 'second-policy' } },
		])
		const next = vi.fn()

		await requirePolicies(
			accountability(),
			['first-policy', 'second-policy'],
			services,
			schema,
			next,
		)

		await vi.waitFor(() => expect(next).toHaveBeenCalledWith())
	})

	it('bypasses administrators without querying access assignments', async () => {
		const { services, readByQuery } = createServices([])
		const next = vi.fn()

		await requirePolicies(accountability({ admin: true }), 'any-policy', services, schema, next)

		expect(next).toHaveBeenCalledWith()
		expect(readByQuery).not.toHaveBeenCalled()
	})

	it('supports admin_access as an administrator bypass', async () => {
		const { services } = createServices([])
		const next = vi.fn()

		expect(
			await requirePolicies(
				Object.assign(accountability(), { admin_access: true }),
				'any-policy',
				services,
				schema,
				next,
			),
		).toBeUndefined()
		expect(next).toHaveBeenCalledWith()
	})

	it('forwards a forbidden error when policies are not assigned', async () => {
		const { services } = createServices([])
		const next = vi.fn()

		await requirePolicies(accountability(), 'missing-policy', services, schema, next)

		await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.any(Error)))
	})
})
