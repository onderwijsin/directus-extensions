import { defineOperationApi } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import {
	parseOperationOptions,
	createMetadataProcessor,
	safeMetadataError,
	type FileResult,
} from '../shared/execution'
import { hasMissingMetadata } from '../shared/metadata'
import { backfillOptionsSchema } from '../shared/options'
import { envSchema } from './env.schema'

export default defineOperationApi({
	id: 'ai-image-metadata-regenerate',
	/**
	 * Scans a bounded image batch with a numeric resume offset.
	 * @param input - Backfill selection and continuation options.
	 * @param context - Directus Flow execution context.
	 * @returns Results, scanned count, continuation offset, and completion state.
	 */
	handler: async (input, context) => {
		const result = await attempt(async () => {
			const setup = extensionSetup('ai_metadata_writer', context.env, context.logger)
			setup.start()
			if (!setup.isEnabled()) return null
			const env = validateExtensionOptions(context.env, envSchema, context.logger)
			setup.end()
			const options = parseOperationOptions(backfillOptionsSchema, input)
			const processor = createMetadataProcessor(
				context,
				await context.getSchema(),
				env,
				options,
			)
			const results: FileResult[] = []
			let offset = options.offset
			let scanned = 0
			while (scanned < options.maxFiles) {
				const page = await processor.readPage(
					offset,
					Math.min(50, options.maxFiles - scanned),
				)
				if (!page.length) return { results, scanned, nextOffset: null, complete: true }
				for (const file of page) {
					offset += 1
					scanned += 1
					results.push(
						options.missingOnly && !hasMissingMetadata(file, options)
							? { id: file.id, status: 'skipped', fields: [] }
							: await processor.processFile(file),
					)
				}
			}
			const remaining = await processor.readPage(offset, 1)
			return {
				results,
				scanned,
				nextOffset: remaining.length ? offset : null,
				complete: !remaining.length,
			}
		})
		if (result.error !== null) throw safeMetadataError(result.error)
		return result.data
	},
})
