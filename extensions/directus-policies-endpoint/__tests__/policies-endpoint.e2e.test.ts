import { describe, expect, it } from 'vitest'

import { createDirectusE2EClient } from '../../../packages/test-utils/src'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN
const composeFilesValue = process.env.DIRECTUS_E2E_COMPOSE_FILES
const composeProject = process.env.DIRECTUS_E2E_COMPOSE_PROJECT

if (!baseUrl || !token || !composeFilesValue || !composeProject) {
	throw new Error('The Directus E2E environment was not initialized')
}

const composeFiles = JSON.parse(composeFilesValue)
if (!Array.isArray(composeFiles) || composeFiles.some((file) => typeof file !== 'string')) {
	throw new Error('The Directus E2E Compose file list is invalid')
}

const client = createDirectusE2EClient({ baseUrl, token, composeFiles, composeProject })

interface PolicyResponse {
	id: string
	name: string
	icon: string
	description: string | null
	enforce_tfa: boolean | null
	admin_access: boolean
	app_access: boolean
}

interface CreatedRecord {
	id: string
}

function policyPayload(name: string, adminAccess = false) {
	return {
		name,
		icon: 'verified',
		description: `${name} policy`,
		enforce_tfa: false,
		admin_access: adminAccess,
		app_access: true,
	}
}

describe('users policies endpoint', () => {
	it('resolves direct, nested, and de-duplicated policies', async () => {
		const email = `policies-e2e-${Date.now()}@example.com`
		const staticToken = `policies-e2e-token-${Date.now()}`
		let userId: string | undefined
		let rootRoleId: string | undefined
		let childRoleId: string | undefined
		let grandchildRoleId: string | undefined
		let directPolicyId: string | undefined
		let childPolicyId: string | undefined
		let grandchildPolicyId: string | undefined

		try {
			const directPolicy = await client.createPolicy<CreatedRecord>(
				policyPayload('E2E direct policy', true),
			)
			directPolicyId = directPolicy.id

			const childPolicy = await client.createPolicy<CreatedRecord>(
				policyPayload('E2E child policy'),
			)
			childPolicyId = childPolicy.id

			const grandchildPolicy = await client.createPolicy<CreatedRecord>(
				policyPayload('E2E grandchild policy'),
			)
			grandchildPolicyId = grandchildPolicy.id

			const rootRole = await client.createRole<CreatedRecord>({
				name: 'E2E root role',
				icon: 'group',
				description: 'E2E root role',
				policies: [directPolicy.id],
			})
			rootRoleId = rootRole.id

			const childRole = await client.createRole<CreatedRecord>({
				name: 'E2E child role',
				icon: 'group',
				description: 'E2E child role',
				parent: rootRole.id,
				policies: [childPolicy.id],
			})
			childRoleId = childRole.id

			const grandchildRole = await client.createRole<CreatedRecord>({
				name: 'E2E grandchild role',
				icon: 'group',
				description: 'E2E grandchild role',
				parent: childRole.id,
				policies: [grandchildPolicy.id],
			})
			grandchildRoleId = grandchildRole.id

			const user = await client.createItem<CreatedRecord>('users', {
				email,
				token: staticToken,
				first_name: 'Policies E2E',
				status: 'active',
				role: rootRole.id,
				policies: [directPolicy.id],
			})
			userId = user.id

			const recursive = await client.fetchAsUser(user.id, (request) =>
				request<PolicyResponse[]>('/users/me/policies'),
			)
			expect(recursive.map((policy) => policy.id)).toEqual([
				directPolicy.id,
				childPolicy.id,
				grandchildPolicy.id,
			])
			expect(recursive).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: directPolicy.id,
						name: 'E2E direct policy',
						admin_access: true,
					}),
				]),
			)

			const depthZero = await client.fetchAsUser(user.id, (request) =>
				request<PolicyResponse[]>('/users/me/policies?depth=0'),
			)
			expect(depthZero.map((policy) => policy.id)).toEqual([directPolicy.id])

			const depthOne = await client.fetchAsRole(rootRole.id, (request) =>
				request<PolicyResponse[]>('/users/me/policies?depth=1'),
			)
			expect(depthOne.map((policy) => policy.id)).toEqual([directPolicy.id, childPolicy.id])
		} finally {
			if (userId) await client.deleteItem('users', userId)
			if (grandchildRoleId) await client.deleteRole(grandchildRoleId)
			if (childRoleId) await client.deleteRole(childRoleId)
			if (rootRoleId) await client.deleteRole(rootRoleId)
			if (grandchildPolicyId) await client.deletePolicy(grandchildPolicyId)
			if (childPolicyId) await client.deletePolicy(childPolicyId)
			if (directPolicyId) await client.deletePolicy(directPolicyId)
		}
	})
})
