/** API-side entrypoint for the privileged Sluggernaut recalculation operation. */
import type { RecalculateOptions } from './options.schema'

import { defineOperationApi } from '@directus/extensions-sdk'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_NAME } from '../shared/configuration/constants'
import { envSchema } from '../sluggernaut-hook/configuration/env.schema'
import { recalculateFields } from './handler'
import { validateRecalculateOptions } from './validation'

export default defineOperationApi<RecalculateOptions>({
	id: 'sluggernaut-recalculate',
	/**
	 * Coordinates operation setup, validation, and recalculation execution.
	 * @param options - Operation input.
	 * @param context - Directus operation context.
	 * @returns Recalculation statistics.
	 */
	handler: async (options, context) => {
		const setup = extensionSetup(EXTENSION_NAME, context.env, context.logger)
		setup.start()

		if (!setup.isEnabled()) {
			setup.end()
			return { processed: 0, updated: 0, skipped: 0, failed: 0 }
		}

		const parsedOptions = validateRecalculateOptions(options, context)
		const envOptions = validateExtensionOptions(context.env, envSchema, context.logger)

		try {
			return await recalculateFields(parsedOptions, context, envOptions)
		} finally {
			setup.end()
		}
	},
})
