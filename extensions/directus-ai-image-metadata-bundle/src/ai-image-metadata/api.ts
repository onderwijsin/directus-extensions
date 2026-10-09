import { defineOperationApi } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { writerOptionsSchema } from '../shared/configuration/options'
import { createRunDiagnostics } from '../shared/diagnostics/run-diagnostics'
import {
	parseOperationOptions,
	createMetadataProcessor,
	safeMetadataError,
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
			const run = createRunDiagnostics('ai-image-metadata')
			run.setOptions(options)
			for (const id of options.files) {
				run.found.add(id)
				run.attempt(id)
				run.results.push(
					await processor.processResult({
						id,
						runId: run.runId,
						isolate: options.files.length > 1,
					}),
				)
			}
			const provider = processor.getProvider()
			if (provider) run.setProvider(provider)
			const summary = run.summary(true)
			context.logger.info(summary, `Image metadata completed ${JSON.stringify(summary)}`)
			return { results: run.results, summary }
		})
		if (result.error !== null) throw safeMetadataError(result.error)
		return result.data
	},
})
