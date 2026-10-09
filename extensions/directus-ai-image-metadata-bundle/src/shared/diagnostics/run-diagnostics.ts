import type { z } from 'zod'
import type { backfillOptionsSchema, writerOptionsSchema } from '../configuration/options'
import type { FileResult } from '../processing/contracts'
import type { ProviderConfig } from '../providers/provider'

import { randomUUID } from 'node:crypto'

/**
 * Collects bounded run diagnostics without private configuration or generated content.
 * @param operation - Flow operation identifier.
 * @returns Run correlation and summary builder.
 */
export function createRunDiagnostics(operation: string) {
	const runId = randomUUID()
	const startedAt = new Date().toISOString()
	const started = performance.now()
	const results: FileResult[] = []
	const found = new Set<string>()
	let options:
		| z.output<typeof backfillOptionsSchema>
		| z.output<typeof writerOptionsSchema>
		| undefined
	let provider: Pick<ProviderConfig, 'provider' | 'model'> | undefined
	const attempted = new Set<string>()
	/**
	 * Builds a final safe summary.
	 * @param complete - Whether enumeration exhausted without failures.
	 * @param fatal - Whether execution rejected.
	 * @returns Summary suitable for Flow output and logs.
	 */
	function summary(complete: boolean, fatal = false) {
		const filesFailed = results.filter((result) => result.status === 'failed').length
		const transformed = results.filter((result) => result.transformed)
		const transformsByMimeType: Record<string, number> = {}
		for (const result of transformed) {
			if (result.originalMimeType)
				transformsByMimeType[result.originalMimeType] =
					(transformsByMimeType[result.originalMimeType] ?? 0) + 1
		}
		return {
			runId,
			operation,
			startedAt,
			completedAt: new Date().toISOString(),
			durationMs: performance.now() - started,
			provider: provider?.provider ?? null,
			model: provider?.model ?? null,
			options: options
				? {
						...('maxFiles' in options
							? {
									maxFiles: options.maxFiles,
									concurrency: options.concurrency,
									missingOnly: options.missingOnly,
									afterId: options.afterId,
									excludedFileCount: options.excludeFiles.length,
								}
							: { files: options.files }),
						language: options.language ?? null,
						includeRoot: options.includeRoot,
						includeFolders: options.includeFolders,
						excludeFolders: options.excludeFolders,
						generateAltText: options.generateAltText,
						generateTags: options.generateTags,
						generateFilename: options.generateFilename,
						overwriteAltText: options.overwriteAltText,
						overwriteTags: options.overwriteTags,
						overwriteFilename: options.overwriteFilename,
					}
				: null,
			filesFound: found.size,
			filesAttempted: attempted.size,
			filesUpdated: results.filter((result) => result.status === 'updated').length,
			filesSkipped: results.filter((result) => result.status === 'skipped').length,
			filesFailed,
			assetsTransformed: transformed.length,
			transformsByMimeType,
			outcome: fatal ? 'failed' : filesFailed ? 'partial_failure' : 'success',
			hasFailures: fatal || filesFailed > 0,
			complete: complete && !fatal && filesFailed === 0,
		}
	}
	return {
		runId,
		results,
		found,
		summary,
		/**
		 * Records validated effective options.
		 * @param value - Validated options.
		 * @returns Nothing.
		 */
		setOptions(
			value: z.output<typeof backfillOptionsSchema> | z.output<typeof writerOptionsSchema>,
		) {
			options = value
		},
		/**
		 * Records provider identity, discarding credentials.
		 * @param value - Resolved provider.
		 * @returns Nothing.
		 */
		setProvider(value: ProviderConfig) {
			provider = { provider: value.provider, model: value.model }
		},
		/**
		 * Counts one distinct admitted file attempt.
		 * @param id - File identifier.
		 * @returns Nothing.
		 */
		attempt(id: string) {
			attempted.add(id)
		},
	}
}
