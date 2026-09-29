/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-call */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	setup: { start: vi.fn(), end: vi.fn(), isEnabled: vi.fn(() => true) },
	validateExtensionOptions: vi.fn(() => ({
		MARKDOWN_EDITOR_ENABLED: true,
		EDITOR_AI_PROVIDER: 'openai' as const,
		EDITOR_AI_MODEL: 'test-model',
		EDITOR_AI_API_KEY: 'test-key',
		EDITOR_AI_MAX_CONTENT_LENGTH: 100_000,
	})),
	hasPolicies: vi.fn().mockResolvedValue(true),
	readField: vi.fn().mockResolvedValue({
		meta: { interface: 'markdown-editor', options: { ai: true, tools: ['paragraph'] } },
	}),
	readSkill: vi.fn().mockResolvedValue({
		prompt: 'Improve the writing.',
		scopes: ['document'],
		archived: false,
	}),
	generateEditorReplacement: vi.fn().mockResolvedValue('# Improved'),
}))

vi.mock('@directus/extensions-sdk', () => ({
	defineEndpoint: (definition: unknown) => definition,
}))

vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => ({
	...(await importOriginal()),
	assertRequestWithAccountability: (request: { accountability?: { user?: unknown } }) =>
		Boolean(request.accountability?.user),
	extensionSetup: () => mocks.setup,
	hasPolicies: mocks.hasPolicies,
	validateExtensionOptions: mocks.validateExtensionOptions,
}))

vi.mock('../src/editor-endpoint/provider', () => ({
	generateEditorReplacement: mocks.generateEditorReplacement,
}))

import endpoint from '../src/editor-endpoint'

type EndpointRoute = (
	request: { accountability?: object; body?: unknown },
	response: { json: ReturnType<typeof vi.fn> },
	next: ReturnType<typeof vi.fn>,
) => void

let registeredRoute: EndpointRoute | undefined
const createRouter = () => ({
	post: vi.fn((_path: string, route: EndpointRoute) => {
		registeredRoute = route
	}),
})

function registerEndpoint(router: ReturnType<typeof createRouter>) {
	const handler = Reflect.get(endpoint, 'handler')
	if (typeof handler !== 'function') throw new Error('Expected endpoint handler')
	Reflect.apply(handler, undefined, [
		router,
		{
			env: {},
			logger: { error: vi.fn() },
			getSchema: vi.fn().mockResolvedValue({}),
			services: {
				FieldsService: class {
					public readOne = mocks.readField
				},
				ItemsService: class {
					public readOne = mocks.readSkill
				},
			},
		},
	])
}

function getRoute() {
	if (!registeredRoute) throw new Error('Expected POST route')
	return registeredRoute
}

const accountability = {
	user: 'user-id',
	role: 'role-id',
	roles: ['role-id'],
	admin: false,
	app: true,
	ip: null,
}

const validRequest = {
	accountability,
	body: {
		scope: 'document',
		content: '# Original',
		prompt: 'Improve this.',
		collection: 'pages',
		field: 'body',
	},
}

describe('Markdown Editor endpoint orchestration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		registeredRoute = undefined
		mocks.setup.isEnabled.mockReturnValue(true)
		mocks.hasPolicies.mockResolvedValue(true)
		mocks.readField.mockResolvedValue({
			meta: { interface: 'markdown-editor', options: { ai: true, tools: ['paragraph'] } },
		})
		mocks.readSkill.mockResolvedValue({
			prompt: 'Improve the writing.',
			scopes: ['document'],
			archived: false,
		})
		mocks.generateEditorReplacement.mockResolvedValue('# Improved')
	})

	it('registers POST /ai after validating enabled configuration', () => {
		const router = createRouter()
		registerEndpoint(router)

		expect(mocks.setup.start).toHaveBeenCalledOnce()
		expect(mocks.validateExtensionOptions).toHaveBeenCalledOnce()
		expect(router.post).toHaveBeenCalledWith('/ai', expect.any(Function))
		expect(mocks.setup.end).toHaveBeenCalledOnce()
	})

	it('does not validate or register routes when disabled', () => {
		mocks.setup.isEnabled.mockReturnValue(false)
		const router = createRouter()
		registerEndpoint(router)

		expect(mocks.validateExtensionOptions).not.toHaveBeenCalled()
		expect(router.post).not.toHaveBeenCalled()
		expect(mocks.setup.end).not.toHaveBeenCalled()
	})

	it('rejects anonymous requests before accessing Directus services', async () => {
		const router = createRouter()
		registerEndpoint(router)
		const next = vi.fn()

		getRoute()({ body: validRequest.body }, { json: vi.fn() }, next)

		await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.any(Error)))
		expect(mocks.hasPolicies).not.toHaveBeenCalled()
		expect(mocks.readField).not.toHaveBeenCalled()
	})

	it('uses policy and field configuration before generating a response', async () => {
		const router = createRouter()
		registerEndpoint(router)
		const response = { json: vi.fn() }
		const next = vi.fn()

		getRoute()(validRequest, response, next)

		await vi.waitFor(() =>
			expect(response.json).toHaveBeenCalledWith({ content: '# Improved' }),
		)
		expect(mocks.hasPolicies).toHaveBeenCalledOnce()
		expect(mocks.readField).toHaveBeenCalledWith('pages', 'body')
		expect(mocks.generateEditorReplacement).toHaveBeenCalledWith(
			expect.objectContaining({ provider: 'openai', model: 'test-model' }),
			'Improve this.',
			'# Original',
			undefined,
			['paragraph'],
			'document',
			undefined,
		)
		expect(next).not.toHaveBeenCalled()
	})

	it('lets administrators bypass the seeded policy', async () => {
		const router = createRouter()
		registerEndpoint(router)
		const response = { json: vi.fn() }

		getRoute()(
			{ ...validRequest, accountability: { ...accountability, admin: true } },
			response,
			vi.fn(),
		)

		await vi.waitFor(() => expect(response.json).toHaveBeenCalled())
		expect(mocks.hasPolicies).not.toHaveBeenCalled()
	})

	it('loads stored skills with request accountability and enforces their scope', async () => {
		const router = createRouter()
		registerEndpoint(router)
		const response = { json: vi.fn() }
		const request = {
			...validRequest,
			body: {
				...validRequest.body,
				prompt: undefined,
				skillId: '019941df-2c10-7b6e-8c42-5d7f91a3e608',
			},
		}

		getRoute()(request, response, vi.fn())

		await vi.waitFor(() => expect(response.json).toHaveBeenCalled())
		expect(mocks.readSkill).toHaveBeenCalledWith(request.body.skillId, {
			fields: ['prompt', 'scopes', 'archived'],
		})
		expect(mocks.generateEditorReplacement).toHaveBeenCalledWith(
			expect.any(Object),
			'Improve the writing.',
			expect.anything(),
			undefined,
			expect.anything(),
			'document',
			undefined,
		)
	})

	it('rejects fields that do not explicitly enable editor AI', async () => {
		mocks.readField.mockResolvedValueOnce({
			meta: { interface: 'markdown-editor', options: { ai: false } },
		})
		const router = createRouter()
		registerEndpoint(router)
		const next = vi.fn()

		getRoute()(validRequest, { json: vi.fn() }, next)

		await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.any(Error)))
		expect(mocks.generateEditorReplacement).not.toHaveBeenCalled()
	})

	it('maps provider failures through the endpoint error boundary', async () => {
		mocks.generateEditorReplacement.mockRejectedValueOnce(new Error('provider secret'))
		const router = createRouter()
		registerEndpoint(router)
		const next = vi.fn()

		getRoute()(validRequest, { json: vi.fn() }, next)

		await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.any(Error)))
	})
})
