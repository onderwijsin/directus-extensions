/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-call */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
	const hookRegister = vi.fn()
	const setup = { end: vi.fn(), isEnabled: vi.fn(() => true), start: vi.fn() }
	const startup = { data: vi.fn(), documentation: vi.fn(), schema: vi.fn() }

	return {
		createDirectusStartupCoordinator: vi.fn(() => startup),
		ensureDirectusDocumentation: vi.fn(),
		ensureDirectusPolicy: vi.fn(),
		extensionSetup: vi.fn(() => setup),
		hookRegister,
		setup,
		startup,
		validateExtensionOptions: vi.fn(() => ({
			DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			MARKDOWN_EDITOR_DOCS_SEED_ENABLED: true,
			MARKDOWN_EDITOR_ENABLED: true,
			MARKDOWN_EDITOR_SCHEMA_CHANGES_ENABLED: true,
			MARKDOWN_EDITOR_SCHEMA_ABORT_ON_ERROR: true,
			MARKDOWN_EDITOR_SKILLS_SEED_ENABLED: true,
			MARKDOWN_EDITOR_SKILLS_SEEDING_STRATEGY: 'versioning',
		})),
		seedEditorSkills: vi.fn(),
	}
})

vi.mock('@onderwijsin/directus-extension-utils/hook', () => ({
	defineHook: vi.fn((register) => {
		mocks.hookRegister.mockImplementation(register)
	}),
}))

vi.mock('@onderwijsin/directus-extension-utils/server', async () => {
	const actual = await vi.importActual<
		typeof import('@onderwijsin/directus-extension-utils/server')
	>('@onderwijsin/directus-extension-utils/server')
	return {
		...actual,
		createDirectusStartupCoordinator: mocks.createDirectusStartupCoordinator,
		ensureDirectusDocumentation: mocks.ensureDirectusDocumentation,
		ensureDirectusPolicy: mocks.ensureDirectusPolicy,
		extensionSetup: mocks.extensionSetup,
		validateExtensionOptions: mocks.validateExtensionOptions,
	}
})

vi.mock('../src/markdown-editor-hook/skill-seeding', () => ({
	seedEditorSkills: mocks.seedEditorSkills,
}))

import docsArticle from '../docs/markdown-editor.json'
import skillSeeds from '../seeds/editor_skills.json'
import { envSchema } from '../src/markdown-editor-hook/env.schema'
import '../src/markdown-editor-hook'

describe('Markdown Editor bundle', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.setup.isEnabled.mockReturnValue(true)
	})

	it('provides enabled startup defaults', () => {
		expect(envSchema.parse({})).toMatchObject({
			MARKDOWN_EDITOR_ENABLED: true,
			MARKDOWN_EDITOR_DOCS_SEED_ENABLED: true,
			MARKDOWN_EDITOR_SCHEMA_CHANGES_ENABLED: true,
			MARKDOWN_EDITOR_SCHEMA_ABORT_ON_ERROR: true,
			MARKDOWN_EDITOR_SKILLS_SEED_ENABLED: true,
			MARKDOWN_EDITOR_SKILLS_SEEDING_STRATEGY: 'versioning',
		})
	})

	it('seeds editor skills during the hook-owned data phase', async () => {
		const context = { env: {}, logger: {} }
		mocks.hookRegister({ init: vi.fn() }, context)
		const callback = mocks.startup.data.mock.calls[0]?.[0]
		expect(callback).toBeTypeOf('function')
		if (!callback) return

		await callback({ lockProvider: {} })

		expect(mocks.seedEditorSkills).toHaveBeenCalledWith(skillSeeds.skills, context, {
			abortOnError: true,
			strategy: 'versioning',
		})
	})

	it('registers its documentation article during coordinated startup', async () => {
		const context = { env: {}, logger: {} }
		mocks.hookRegister({ init: vi.fn() }, context)

		expect(mocks.createDirectusStartupCoordinator).toHaveBeenCalledOnce()
		expect(mocks.startup.documentation).toHaveBeenCalledOnce()
		expect(mocks.startup.schema).toHaveBeenCalledOnce()
		expect(mocks.startup.data).toHaveBeenCalledOnce()
		const callback = mocks.startup.documentation.mock.calls[0]?.[0]
		expect(callback).toBeTypeOf('function')
		if (!callback) return

		const lockProvider = {}
		await callback({ lockProvider })

		expect(mocks.ensureDirectusDocumentation).toHaveBeenCalledWith(docsArticle, context, {
			lockProvider,
			extensionName: 'Markdown Editor',
			extensionSeedEnabled: true,
		})
		expect(docsArticle).toMatchObject({
			icon: 'edit_note',
			id: '019941df-2c10-7b6e-8c42-5d7f91a3e608',
			navigation_label: 'Editor',
		})
		expect(docsArticle.body).toContain('# Markdown-editor')
		expect(docsArticle.body).toContain('## 🧩 Werken met componenten')
		expect(mocks.setup.end).toHaveBeenCalledOnce()
	})

	it('skips validation and coordination when disabled', () => {
		mocks.setup.isEnabled.mockReturnValue(false)
		mocks.hookRegister({ init: vi.fn() }, { env: {}, logger: {} })

		expect(mocks.validateExtensionOptions).not.toHaveBeenCalled()
		expect(mocks.createDirectusStartupCoordinator).not.toHaveBeenCalled()
		expect(mocks.setup.end).not.toHaveBeenCalled()
	})
})
