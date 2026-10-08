import type { z } from 'zod'
import type { MetadataFile } from '../shared/configuration/options'
import type { backfillOptionsSchema } from '../shared/configuration/options'
import type { FileResult } from '../shared/processing/contracts'

import { hasMissingMetadata } from '../shared/metadata/metadata'

/**
 * Runs a continuously replenished queue with serialized prefetch and bounded metadata refinement.
 * @param options - Validated regeneration controls.
 * @param read - Accountable, strictly ID-sorted reader without omitted matches before its last ID.
 * Nonempty pages must have a null nextBoundary; an empty page may advance over a verified window.
 * @param process - End-to-end processor returning ordinary file failures as FileResult.
 * Throws indicate fatal run failures. Active work settles and partial results survive rejection.
 * @param admitted - Records a selected file in run diagnostics.
 * @param results - Settled results populated in selection order, also on fatal errors.
 * @returns Continuation and enumeration state, excluding outstanding failures.
 */
export async function runRegenerationQueue(
	options: z.output<typeof backfillOptionsSchema>,
	read: (
		afterId: string | null,
		excluded: string[],
		limit: number,
	) => Promise<{ files: MetadataFile[]; nextBoundary: string | null }>,
	process: (file: MetadataFile) => Promise<FileResult>,
	admitted: (id: string) => void,
	results: FileResult[],
) {
	const seen = new Set(options.excludeFiles)
	const queued: MetadataFile[] = []
	const settled = new Map<number, FileResult>()
	let selected = 0
	let inspected = 0
	let exhausted = !options.generateAltText && !options.generateTags && !options.generateFilename
	let afterId = options.afterId
	let fatal: { error: unknown } | undefined
	let lock: Promise<void> = Promise.resolve()
	/**
	 * Serializes selection so workers cannot duplicate prefetches or exceed either bound.
	 * @returns Next admitted candidate and its deterministic output index.
	 */
	async function next() {
		const previous = lock
		/** Releases the serialized selection lock after this caller finishes. */
		let unlock: (() => void) | undefined
		lock = new Promise<void>((resolve) => {
			unlock = resolve
		})
		await previous
		try {
			while (!fatal && selected < options.maxFiles && inspected < 1000) {
				if (!queued.length) {
					if (exhausted) return undefined
					const page = await read(afterId, [...seen], Math.min(50, 1000 - inspected))
					if (fatal) return undefined
					if (page.files.length && page.nextBoundary)
						throw new Error(
							'A nonempty candidate page cannot advance a separate boundary.',
						)
					if (!page.files.length && page.nextBoundary) {
						afterId = page.nextBoundary
						inspected = 1000
						return undefined
					}
					if (!page.files.length) {
						exhausted = true
						return undefined
					}
					for (const file of page.files) {
						if (seen.has(file.id)) continue
						seen.add(file.id)
						queued.push(file)
					}
					if (!queued.length) throw new Error('File enumeration did not advance.')
				}
				const file = queued.shift()
				if (!file) continue
				inspected += 1
				afterId = file.id
				if (options.missingOnly && !hasMissingMetadata(file, options)) continue
				const index = selected++
				admitted(file.id)
				return { file, index }
			}
			return undefined
		} catch (error) {
			fatal ??= { error }
			throw error
		} finally {
			unlock?.()
		}
	}
	/**
	 * Refills one free slot immediately and observes all rejections before shutdown.
	 * @returns Nothing after admission stops and this worker settles.
	 */
	async function worker() {
		try {
			while (!fatal) {
				const candidate = await next()
				if (!candidate || fatal) return
				settled.set(candidate.index, await process(candidate.file))
			}
		} catch (error) {
			fatal ??= { error }
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(options.concurrency, options.maxFiles) }, worker),
	)
	results.push(...[...settled].sort(([left], [right]) => left - right).map(([, value]) => value))
	if (fatal) throw fatal.error
	// Probe only after active writes settle. A coarse metadata match conservatively means more work.
	if (!exhausted && !queued.length && inspected < 1000) {
		const probe = await read(afterId, [...seen], 1)
		exhausted = !probe.files.length && !probe.nextBoundary
	}
	const remaining = !exhausted || queued.length > 0
	return {
		scanned: selected,
		inspected,
		remaining,
		nextCursor: remaining ? afterId : null,
		complete: !remaining,
	}
}
