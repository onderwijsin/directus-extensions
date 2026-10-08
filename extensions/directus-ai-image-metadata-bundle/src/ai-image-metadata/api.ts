import { randomUUID } from 'node:crypto'

import { defineOperationApi } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { writerOptionsSchema } from '../shared/configuration/options'
import {
	parseOperationOptions,
	createMetadataProcessor,
	safeMetadataError,
	type FileResult,
} from '../shared/processing/execution'
import { envSchema } from './env.schema'

export default defineOperationApi({
	id: 'ai-image-metadata',
	/**
	 * Generates metadata for explicit private Directus images.
	 * @param input - Persisted or templated operation options.
	 * @param context - Directus Flow execution context.
	 * @returns Per-file updates, or null when disabled.
	 */
	handler: async (input, context) => {
		const result = await attempt(async () => {
			const setup = extensionSetup('ai_metadata_writer', context.env, context.logger)
			setup.start()
			if (!setup.isEnabled()) return null
			const env = validateExtensionOptions(context.env, envSchema, context.logger)
			setup.end()
			const options = parseOperationOptions(writerOptionsSchema, input)
			const processor = createMetadataProcessor(
				context,
				await context.getSchema(),
				env,
				options,
			)
			const results: FileResult[] = []
			const runId = randomUUID()
			for (const id of options.files)
				results.push(
					await processor.processResult({ id, runId, isolate: options.files.length > 1 }),
				)
			return { results }
		})
		if (result.error !== null) throw safeMetadataError(result.error)
		return result.data
	},
})
