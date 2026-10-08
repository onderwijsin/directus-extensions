import { defineOperationApi } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { atStage, classifyFailure, ProcessingFailure } from '../shared/diagnostics'
import {
	parseOperationOptions,
	createMetadataProcessor,
	safeMetadataError,
	type FileResult,
} from '../shared/execution'
import { hasMissingMetadata } from '../shared/metadata'
import { backfillOptionsSchema } from '../shared/options'
import { createRunDiagnostics } from '../shared/run-diagnostics'
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
		const run = createRunDiagnostics('ai-image-metadata-regenerate')
		let complete = false
		let enabled = true
		let getProvider: (() => import('../shared/provider').ProviderConfig | undefined) | undefined
		const result = await attempt(async () => {
			const setup = extensionSetup('ai_metadata_writer', context.env, context.logger)
			setup.start()
			if (!setup.isEnabled()) {
				enabled = false
				return null
			}
			const env = validateExtensionOptions(context.env, envSchema, context.logger)
			setup.end()
			const options = parseOperationOptions(backfillOptionsSchema, input)
			run.setOptions(options)
			const processor = createMetadataProcessor(
				context,
				await context.getSchema(),
				env,
				options,
			)
			getProvider = processor.getProvider
			const results: FileResult[] = run.results
			let offset = options.offset
			let scanned = 0
			const selected = new Set<string>()
			while (scanned < options.maxFiles) {
				const page = await atStage('enumerate', () =>
					processor.readPage(offset, Math.min(50, options.maxFiles - scanned)),
				)
				for (const file of page) run.found.add(file.id)
				if (!page.length) {
					complete = true
					return { results, scanned, nextOffset: null }
				}
				for (const file of page) {
					offset += 1
					scanned += 1
					if (selected.has(file.id)) continue
					selected.add(file.id)
					run.attempt(file.id)
					const started = performance.now()
					results.push(
						options.missingOnly && !hasMissingMetadata(file, options)
							? {
									id: file.id,
									status: 'skipped',
									fields: [],
									durationMs: performance.now() - started,
								}
							: await processor.processResult({
									id: file.id,
									file,
									runId: run.runId,
									isolate: true,
								}),
					)
				}
			}
			const remaining = await atStage('enumerate', () => processor.readPage(offset, 1))
			for (const file of remaining) run.found.add(file.id)
			complete = !remaining.length
			return {
				results,
				scanned,
				nextOffset: remaining.length ? offset : null,
			}
		})
		if (!enabled) return null
		const provider = getProvider?.()
		if (provider) run.setProvider(provider)
		const summary = {
			...run.summary(complete, result.error !== null),
			...(result.error === null
				? {}
				: {
						error:
							result.error instanceof ProcessingFailure
								? result.error.diagnostic
								: classifyFailure('validate_options', result.error),
					}),
		}
		context.logger.info(
			summary,
			`Image metadata regeneration completed ${JSON.stringify(summary)}`,
		)
		if (result.error !== null) throw safeMetadataError(result.error)
		return { ...result.data, summary, complete: summary.complete }
	},
})
