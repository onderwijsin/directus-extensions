/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
	interface ModuleDefinition {
		id: string
		name: string
		routes: { path: string }[]
	}
	const hookRegister = vi.fn()
	const moduleDefinitions: ModuleDefinition[] = []
	const setup = { end: vi.fn(), isEnabled: vi.fn(() => true), start: vi.fn() }
	const startup = { schema: vi.fn(), data: vi.fn(), documentation: vi.fn() }
	return {
		defineHook: vi.fn((register) => {
			hookRegister.mockImplementation(register)
			return undefined
		}),
		defineModule: vi.fn((definition: ModuleDefinition) => {
			moduleDefinitions.push(definition)
			return definition
		}),
		extensionSetup: vi.fn(() => setup),
		createDirectusStartupCoordinator: vi.fn(() => startup),
		ensureDirectusPolicy: vi.fn(),
		ensureDirectusSchema: vi.fn(),
		hookRegister,
		moduleDefinitions,
		startup,
		setup,
		validateExtensionOptions: vi.fn(() => ({
			DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR: true,
			DIRECTUS_DOCS_SEED_ENABLED: true,
			DIRECTUS_DOCS_MANAGE_POLICY_ENABLED: true,
			DIRECTUS_DOCS_VIEW_POLICY_ENABLED: true,
		})),
	}
})

vi.mock('@directus/extensions-sdk', () => ({
	defineHook: mocks.defineHook,
	defineModule: mocks.defineModule,
}))
vi.mock('@onderwijsin/directus-extension-utils/server', async () => {
	const actual = await vi.importActual<
		typeof import('@onderwijsin/directus-extension-utils/server')
	>('@onderwijsin/directus-extension-utils/server')
	return {
		...actual,
		createDirectusStartupCoordinator: mocks.createDirectusStartupCoordinator,
		extensionSetup: mocks.extensionSetup,
		ensureDirectusPolicy: mocks.ensureDirectusPolicy,
		ensureDirectusSchema: mocks.ensureDirectusSchema,
		validateExtensionOptions: mocks.validateExtensionOptions,
	}
})

import { COLLECTION_NAME, MODULE_ID, MODULE_NAME } from '../src/shared/constants'
import { envSchema } from '../src/studio-docs-hook/env.schema'
import '../src/studio-docs-hook'
import '../src/studio-docs-module'

describe('Studio Docs bundle Phase 1 scaffold', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
	})

	it('provides the documented environment defaults', () => {
		expect(envSchema.parse({})).toMatchObject({
			DIRECTUS_DOCS_ENABLED: true,
			DIRECTUS_DOCS_SEED_ENABLED: true,
			DIRECTUS_DOCS_SEEDING_STRATEGY: 'versioning',
			DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR: true,
			DIRECTUS_DOCS_MANAGE_POLICY_ENABLED: true,
			DIRECTUS_DOCS_VIEW_POLICY_ENABLED: true,
		})
	})

	it('keeps the collection and module name as client-side constants', () => {
		expect(COLLECTION_NAME).toBe('studio_docs')
		expect(MODULE_NAME).toBe('Docs')
		expect(
			envSchema.parse({ DIRECTUS_DOCS_COLLECTION: 'other_collection' }),
		).not.toHaveProperty('DIRECTUS_DOCS_COLLECTION')
	})

	it('rejects invalid seeding strategies', () => {
		expect(envSchema.safeParse({ DIRECTUS_DOCS_SEEDING_STRATEGY: 'replace' }).success).toBe(
			false,
		)
	})

	it('validates enabled hook configuration and completes setup', () => {
		mocks.hookRegister({ action: vi.fn(), init: vi.fn() }, { env: {}, logger: {} })

		expect(mocks.validateExtensionOptions).toHaveBeenCalledWith({}, envSchema, {})
		expect(mocks.setup.end).toHaveBeenCalledOnce()
		expect(mocks.createDirectusStartupCoordinator).toHaveBeenCalledOnce()
	})

	it('does not validate or complete disabled hook setup', () => {
		mocks.setup.isEnabled.mockReturnValue(false)
		mocks.hookRegister({ action: vi.fn(), init: vi.fn() }, { env: {}, logger: {} })

		expect(mocks.validateExtensionOptions).not.toHaveBeenCalled()
		expect(mocks.setup.end).not.toHaveBeenCalled()
	})

	it('registers the stable module and both route definitions', () => {
		const definition = mocks.moduleDefinitions[0]
		if (!definition) throw new Error('Expected module definition')

		expect(definition).toMatchObject({ id: MODULE_ID, name: MODULE_NAME })
		expect(definition.routes.map(({ path }: { path: string }) => path)).toEqual(['', ':id'])
	})
})
