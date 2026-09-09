import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	createDirectusStartupCoordinator,
	ensureDirectusDocumentation,
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import docsArticle from '../../docs/markdown-editor.json'
import { envSchema } from './env.schema'

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
		disabled: false,
		disabledGlobally: false,
		lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
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
