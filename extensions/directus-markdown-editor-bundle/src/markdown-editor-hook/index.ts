import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	createDirectusStartupCoordinator,
	ensureDirectusDocumentation,
	ensureDirectusPolicy,
	ensureDirectusSchema,
	extensionSetup,
	validateSchemaDefinition,
	validatePolicyDefinition,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import docsArticle from '../../docs/markdown-editor.json'
import editorSkillsSchema from '../../schema/editor_skills.json'
import editorSkillsPolicy from '../../schema/editor_skills_policy.json'
import skillSeeds from '../../seeds/editor_skills.json'
import { envSchema } from './env.schema'
import { seedEditorSkills } from './skill-seeding'

const EXTENSION_ID = 'markdown-editor'
const EXTENSION_NAME = 'Markdown Editor'

/**
 * Register coordinated startup work for the Markdown Editor bundle.
 * @param hook - Directus hook registration functions.
 * @param context - Directus extension context.
 * @returns Nothing after registration, or when the hook is disabled.
 */
export default defineHook((hook, context) => {
	const setup = extensionSetup(EXTENSION_ID, context.env, context.logger)
	setup.start()

	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(context.env, envSchema, context.logger)
	const startup = createDirectusStartupCoordinator(hook, context.logger, {
		id: EXTENSION_ID,
		name: EXTENSION_NAME,
		disabled: !options.MARKDOWN_EDITOR_SCHEMA_CHANGES_ENABLED,
		disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
		dataDisabledGlobally: !options.DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED,
		abortOnError: options.MARKDOWN_EDITOR_SCHEMA_ABORT_ON_ERROR,
		lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
	})

	startup.schema(async ({ lockProvider }) => {
		await ensureDirectusSchema({
			id: EXTENSION_ID,
			database: context.database,
			getSchema: context.getSchema,
			logger: context.logger,
			services: context.services,
			definition: validateSchemaDefinition(editorSkillsSchema),
			options: { lockProvider, abortOnError: options.MARKDOWN_EDITOR_SCHEMA_ABORT_ON_ERROR },
		})
	})

	startup.data(async ({ lockProvider }) => {
		const definition = validatePolicyDefinition(editorSkillsPolicy).policies[0]
		if (definition) {
			await ensureDirectusPolicy({
				id: EXTENSION_ID,
				database: context.database,
				getSchema: context.getSchema,
				logger: context.logger,
				services: context.services,
				definition,
				options: {
					lockProvider,
					abortOnError: options.MARKDOWN_EDITOR_SCHEMA_ABORT_ON_ERROR,
				},
			})
		}
		if (options.MARKDOWN_EDITOR_SKILLS_SEED_ENABLED) {
			await seedEditorSkills(skillSeeds.skills, context, {
				abortOnError: options.MARKDOWN_EDITOR_SCHEMA_ABORT_ON_ERROR,
				strategy: options.MARKDOWN_EDITOR_SKILLS_SEEDING_STRATEGY,
			})
		}
	})

	startup.documentation(async ({ lockProvider }) => {
		await ensureDirectusDocumentation(docsArticle, context, {
			lockProvider,
			extensionName: EXTENSION_NAME,
			extensionSeedEnabled: options.MARKDOWN_EDITOR_DOCS_SEED_ENABLED,
		})
	})

	setup.end()
})
