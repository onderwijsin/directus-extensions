/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-call */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	rejectWhileSchemaLocked: vi.fn((_next: (error?: unknown) => void) => Promise.resolve(false)),
	setup: { start: vi.fn(), end: vi.fn(), isEnabled: vi.fn(() => true) },
	validateExtensionOptions: vi.fn(() => ({
		COOLIFY_URL: 'https://coolify.example.com',
		COOLIFY_TOKEN: 'token',
		COOLIFY_PROJECTS: [],
		COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID: 'manage-policy',
		COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID: 'read-policy',
		COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: 'trigger-policy',
		COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS: 3000,
	})),
}))

vi.mock('@directus/extensions-sdk', () => ({
	defineEndpoint: (definition: unknown) => definition,
}))
vi.mock('@directus/errors', () => ({
	createError: () => class extends Error {},
	ForbiddenError: class extends Error {},
}))
vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	extensionSetup: () => mocks.setup,
	rejectWhileSchemaLocked: mocks.rejectWhileSchemaLocked,
	validateExtensionOptions: mocks.validateExtensionOptions,
}))
import endpoint from '../src/coolify-deployments-endpoint'

const runEndpoint = (router: ReturnType<typeof createRouter>) => {
	const handler = Reflect.get(endpoint, 'handler')
	if (typeof handler !== 'function') throw new Error('Expected endpoint handler')
	Reflect.apply(handler, undefined, [
		router,
		{
			env: {},
			logger: { error: vi.fn() },
			services: { AccessService: vi.fn() },
			getSchema: vi.fn().mockResolvedValue({}),
		},
	])
}

interface ResponseMock {
	status: ReturnType<typeof vi.fn>
	setHeader: ReturnType<typeof vi.fn>
	json: ReturnType<typeof vi.fn>
}

const createResponse = (): ResponseMock => {
	const response: ResponseMock = {
		status: vi.fn(),
		setHeader: vi.fn(),
		json: vi.fn(),
	}
	response.status.mockReturnValue(response)
	return response
}

const createRouter = () => ({
	use: vi.fn(),
	get: vi.fn(),
	post: vi.fn(),
})

describe('Coolify deployment endpoint orchestration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.rejectWhileSchemaLocked.mockResolvedValue(false)
		mocks.setup.isEnabled.mockReturnValue(true)
	})

	it('applies authentication and schema readiness once as router middleware', async () => {
		const router = createRouter()
		runEndpoint(router)

		expect(router.use).toHaveBeenCalledOnce()
		expect(router.get).toHaveBeenCalledTimes(4)
		expect(router.post).toHaveBeenCalledTimes(2)

		const middleware = router.use.mock.calls[0]?.[0]
		if (typeof middleware !== 'function') throw new Error('Expected middleware')

		const unauthenticatedResponse = createResponse()
		const next = vi.fn()
		middleware(
			{ accountability: null, get: () => undefined, protocol: 'https' },
			unauthenticatedResponse,
			next,
		)
		expect(next).toHaveBeenCalledWith(expect.any(Error))

		const authenticatedResponse = createResponse()
		const authenticatedNext = vi.fn()
		middleware(
			{
				accountability: {
					role: 'role-id',
					roles: ['role-id'],
					user: 'user-id',
					admin: false,
					app: true,
					ip: null,
				},
				get: () => undefined,
				protocol: 'https',
			},
			authenticatedResponse,
			authenticatedNext,
		)
		await vi.waitFor(() => expect(authenticatedNext).toHaveBeenCalledOnce())
	})

	it('rejects every route while the schema is locked', async () => {
		mocks.rejectWhileSchemaLocked.mockImplementation((next) => {
			next(new Error('schema locked'))
			return Promise.resolve(true)
		})
		const router = createRouter()
		runEndpoint(router)

		const middleware = router.use.mock.calls[0]?.[0]
		if (typeof middleware !== 'function') throw new Error('Expected middleware')

		const response = createResponse()
		const next = vi.fn()
		middleware(
			{
				accountability: {
					role: 'role-id',
					roles: ['role-id'],
					user: 'user-id',
					admin: false,
					app: true,
					ip: null,
				},
				get: () => undefined,
				protocol: 'https',
			},
			response,
			next,
		)
		await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.any(Error)))
	})

	it('rejects cross-origin requests in the shared middleware', () => {
		const router = createRouter()
		runEndpoint(router)
		const response = createResponse()
		const next = vi.fn()
		const middleware = router.use.mock.calls[0]?.[0]
		if (typeof middleware !== 'function') throw new Error('Expected middleware')
		middleware(
			{
				accountability: {
					role: 'role-id',
					roles: ['role-id'],
					user: 'user-id',
					admin: false,
					app: true,
					ip: null,
				},
				get: (header: string) =>
					header === 'origin' ? 'https://evil.example.com' : undefined,
				protocol: 'https',
			},
			response,
			next,
		)
		expect(next).toHaveBeenCalledWith(expect.any(Error))
	})
})
