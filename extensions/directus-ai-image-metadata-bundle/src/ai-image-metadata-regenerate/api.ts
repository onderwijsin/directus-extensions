import { defineOperationApi } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { MetadataRegenerationError } from '../shared/contracts'
import { atStage, classifyFailure, ProcessingFailure } from '../shared/diagnostics'
import {
	parseOperationOptions,
	createMetadataProcessor,
	safeMetadataError,
} from '../shared/execution'
import { hasMissingMetadata } from '../shared/metadata'
import { backfillOptionsSchema } from '../shared/options'
import { createRunDiagnostics } from '../shared/run-diagnostics'
import { envSchema } from './env.schema'
import { runRegenerationQueue } from './queue'

export default defineOperationApi({
	id: 'ai-image-metadata-regenerate',
	/**
	 * Processes a bounded candidate stream with stable continuation and replenished concurrency.
	 * @param input - Backfill selection and continuation options.
	 * @param context - Directus Flow execution context.
	 * @returns Ordered results, candidate counts, ID continuation, and completion state.
	 */
	handler: async (input, context) => {
		const run = createRunDiagnostics('ai-image-metadata-regenerate')
		let complete = false
		let restartAfterId: string | null | undefined
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
			restartAfterId = options.afterId
			const processor = createMetadataProcessor(
				context,
				await context.getSchema(),
				env,
				options,
			)
			getProvider = processor.getProvider
			const output = await runRegenerationQueue(
				options,
				(afterId, excludeFiles, limit) =>
					atStage('enumerate', () =>
						processor.readCandidates(afterId, excludeFiles, limit, options.missingOnly),
					),
				(file) =>
					processor.processResult({ id: file.id, file, runId: run.runId, isolate: true }),
				(id) => {
					run.found.add(id)
					run.attempt(id)
				},
				run.results,
			)
			const remainingIds = new Set(
				run.results.filter((file) => file.status === 'failed').map((file) => file.id),
			)
			if (options.missingOnly && run.results.length) {
				// Verify settled writes: a valid empty generated tag list can still leave metadata missing.
				const latest = await atStage('enumerate', () =>
					processor.readPage(options.maxFiles, {
						missingOnly: false,
						excludeFiles: [],
						rangeIds: run.results.map((file) => file.id),
					}),
				)
				for (const file of latest)
					if (hasMissingMetadata(file, options)) remainingIds.add(file.id)
			}
			complete = output.complete && remainingIds.size === 0
			return {
				...output,
				remaining: output.remaining || remainingIds.size > 0,
				remainingIds: [...remainingIds],
				complete,
				results: run.results,
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
		if (result.error !== null) {
			if (restartAfterId !== undefined)
				throw new MetadataRegenerationError({
					summary,
					results: run.results,
					restartAfterId,
				})
			throw safeMetadataError(result.error)
		}
		return { ...result.data, summary, complete: summary.complete }
	},
})
