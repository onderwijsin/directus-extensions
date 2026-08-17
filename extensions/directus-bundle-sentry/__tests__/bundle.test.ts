import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Logger {
	error(...args: unknown[]): void
	info(...args: unknown[]): void
	warn(...args: unknown[]): void
}

type Init = (event: string, handler: (context: { app: unknown }) => void) => void
type Embed = (target: string, markup: string) => void
type Get = (path: string, handler: () => void) => void
type HookRegister = (
	functions: { embed: Embed; init: Init },
	context: { env: Record<string, unknown>; logger: Logger },
) => void
type EndpointRegister = (
	router: { get: Get },
	context: { env: Record<string, unknown>; logger: Logger },
) => void

const mocks = vi.hoisted(() => {
	const setup = {
		end: vi.fn(),
		isEnabled: vi.fn(() => true),
		start: vi.fn(),
	}
	const hookRegister = vi.fn<HookRegister>()
	const endpointRegister = vi.fn<EndpointRegister>()
	const requireSentry = vi.fn(() => ({ setupExpressErrorHandler: vi.fn() }))

	return {
		defineEndpoint: vi.fn((register: EndpointRegister) => {
			endpointRegister.mockImplementation(register)
			return undefined
		}),
		defineHook: vi.fn((register: HookRegister) => {
			hookRegister.mockImplementation(register)
			return undefined
		}),
		extensionSetup: vi.fn(() => setup),
		endpointRegister,
		hookRegister,
		requireSentry,
		setup,
		validateExtensionOptions: vi.fn(),
	}
})

vi.mock('@directus/extensions-sdk', () => ({
	defineEndpoint: mocks.defineEndpoint,
	defineHook: mocks.defineHook,
}))
vi.mock('@onderwijsin/directus-extension-utils/server', () => ({
	extensionSetup: mocks.extensionSetup,
	validateExtensionOptions: mocks.validateExtensionOptions,
}))
vi.mock('node:module', () => ({ createRequire: vi.fn(() => mocks.requireSentry) }))

import { envSchema as hookEnvSchema } from '../src/sentry-hook/env.schema'
import '../src/sentry-hook'
import { envSchema as endpointEnvSchema } from '../src/sentry-test-endpoint/env.schema'
import '../src/sentry-test-endpoint'

const logger: Logger = {
	error: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
}

describe('Sentry bundle', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
		mocks.validateExtensionOptions.mockReturnValue({
			DEPLOYMENT_ENV: 'development',
			SENTRY_DSN: undefined,
			SENTRY_ENABLED: true,
			SENTRY_LOADER_SCRIPT: undefined,
			SENTRY_RELEASE: undefined,
			SENTRY_RELEASE_PREFIX: 'dev',
			SOURCE_COMMIT: 'unknown',
		})
	})

	it('disables the bundle by default in both environment schemas', () => {
		expect(hookEnvSchema.parse({}).SENTRY_ENABLED).toBe(false)
		expect(endpointEnvSchema.parse({}).SENTRY_ENABLED).toBe(false)
		expect(endpointEnvSchema.parse({}).SENTRY_TEST_SUITE_ENABLED).toBe(false)
	})

	it('accepts the documented multiline loader script', () => {
		const loaderScript = `<script
  src="https://js-de.sentry-cdn.com/0123456789abcdef0123456789abcdef.min.js"
  crossorigin="anonymous"
></script>`

		expect(
			hookEnvSchema.parse({ SENTRY_LOADER_SCRIPT: loaderScript }).SENTRY_LOADER_SCRIPT,
		).toBe(loaderScript)
	})

	it('does not load the Node Sentry dependency when disabled', () => {
		mocks.setup.isEnabled.mockReturnValue(false)

		mocks.hookRegister({ init: vi.fn<Init>(), embed: vi.fn<Embed>() }, { env: {}, logger })

		expect(mocks.requireSentry).not.toHaveBeenCalled()
		expect(mocks.validateExtensionOptions).not.toHaveBeenCalled()
	})

	it('does not load the Node Sentry dependency when the default is parsed as disabled', () => {
		mocks.validateExtensionOptions.mockReturnValueOnce({
			DEPLOYMENT_ENV: 'development',
			SENTRY_ENABLED: false,
			SENTRY_RELEASE_PREFIX: 'dev',
			SOURCE_COMMIT: 'unknown',
		})

		mocks.hookRegister({ init: vi.fn<Init>(), embed: vi.fn<Embed>() }, { env: {}, logger })

		expect(mocks.requireSentry).not.toHaveBeenCalled()
	})

	it('registers the Express handler only when a DSN is configured', () => {
		const init = vi.fn<Init>()
		const setupExpressErrorHandler = vi.fn()
		mocks.requireSentry.mockReturnValueOnce({ setupExpressErrorHandler })
		mocks.validateExtensionOptions.mockReturnValueOnce({
			DEPLOYMENT_ENV: 'development',
			SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
			SENTRY_ENABLED: true,
			SENTRY_LOADER_SCRIPT: undefined,
			SENTRY_RELEASE: undefined,
			SENTRY_RELEASE_PREFIX: 'dev',
			SOURCE_COMMIT: 'unknown',
		})

		mocks.hookRegister({ init, embed: vi.fn<Embed>() }, { env: {}, logger })

		expect(init).toHaveBeenCalledWith('routes.custom.after', expect.any(Function))
		const registerErrorHandler = init.mock.calls[0]?.[1]
		if (typeof registerErrorHandler !== 'function') throw new Error('Expected init callback')
		registerErrorHandler({ app: {} })
		expect(setupExpressErrorHandler).toHaveBeenCalledWith({})
	})

	it('serializes browser configuration values before embedding them', () => {
		const embed = vi.fn<Embed>()
		mocks.validateExtensionOptions.mockReturnValueOnce({
			DEPLOYMENT_ENV: 'development',
			SENTRY_DSN: undefined,
			SENTRY_ENABLED: true,
			SENTRY_LOADER_SCRIPT:
				'<script src="https://js-de.sentry-cdn.com/0123456789abcdef0123456789abcdef.min.js" crossorigin="anonymous"></script>',
			SENTRY_RELEASE: 'release"; window.pwned = true; //',
			SENTRY_RELEASE_PREFIX: 'dev',
			SOURCE_COMMIT: 'unknown',
		})

		mocks.hookRegister({ init: vi.fn<Init>(), embed }, { env: {}, logger })

		const markup = embed.mock.calls[0]?.[1]
		expect(markup).toContain('release: "release\\\"; window.pwned = true; //"')
		expect(markup).not.toContain('release: "release"; window.pwned')
	})

	it('registers the test endpoint only when explicitly enabled', () => {
		const router = { get: vi.fn<Get>() }
		mocks.validateExtensionOptions.mockReturnValueOnce({
			SENTRY_ENABLED: true,
			SENTRY_TEST_SUITE_ENABLED: true,
		})

		mocks.endpointRegister(router, { env: {}, logger })

		expect(router.get).toHaveBeenCalledWith('/', expect.any(Function))
	})

	it('skips the test endpoint when the test suite flag is disabled', () => {
		const router = { get: vi.fn<Get>() }

		mocks.endpointRegister(router, { env: {}, logger })

		expect(router.get).not.toHaveBeenCalled()
	})
})
