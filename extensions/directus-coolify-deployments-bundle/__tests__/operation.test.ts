import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ app: vi.fn(), api: vi.fn() }))
vi.mock('@directus/extensions-sdk', () => ({
	defineOperationApp: (definition: unknown) => {
		mocks.app(definition)
		return definition
	},
	defineOperationApi: (definition: unknown) => {
		mocks.api(definition)
		return definition
	},
}))

import operationApp from '../src/coolify-deploy-operation'
import operationApi from '../src/coolify-deploy-operation/api'

describe('Coolify deploy operation', () => {
	it('exposes stable operation metadata and both options', () => {
		expect(operationApp).toMatchObject({ id: 'coolify-deploy', name: 'Coolify Deploy' })
		expect(operationApp.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ field: 'project', type: 'string' }),
				expect.objectContaining({ field: 'force', type: 'boolean' }),
			]),
		)
	})

	it('registers a server handler for the operation', () => {
		expect(operationApi).toMatchObject({ id: 'coolify-deploy' })
		expect(operationApi.handler).toBeTypeOf('function')
	})
})
