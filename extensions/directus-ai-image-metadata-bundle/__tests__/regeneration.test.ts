import type { FileResult } from '../src/shared/processing/contracts'

import { describe, expect, it, vi } from 'vitest'

import { runRegenerationQueue } from '../src/ai-image-metadata-regenerate/queue'
import { backfillOptionsSchema, type MetadataFile } from '../src/shared/configuration/options'
import { createRunDiagnostics } from '../src/shared/diagnostics/run-diagnostics'
import { hasMissingMetadata } from '../src/shared/metadata/metadata'
import { MetadataRegenerationError } from '../src/shared/processing/contracts'

/**
 * Builds deterministic, sortable fixture IDs.
 * @param index - Fixture ordinal.
 * @returns Valid UUID.
 */
function id(index: number) {
	return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}
/**
 * Creates a missing image fixture.
 * @param index - Fixture ordinal.
 * @returns File metadata.
 */
function file(index: number): MetadataFile {
	return {
		id: id(index),
		type: 'image/png',
		folder: null,
		description: null,
		tags: null,
		filename_download: 'image.png',
	}
}
/**
 * Provides controlled completion without elapsed-time assertions.
 * @returns Promise and completion function.
 */
function deferred() {
	let resolve = () => {
		/* Assigned synchronously by the promise executor. */
	}
	const promise = new Promise<void>((done) => {
		resolve = done
	})
	return { promise, resolve }
}
/**
 * Reads a mutable fixture set using accountable reader continuation semantics.
 * @param files - Mutable fixtures.
 * @returns Page reader.
 */
function reader(files: MetadataFile[]) {
	return vi.fn((afterId: string | null, excluded: string[], limit: number) =>
		Promise.resolve({
			files: files
				.filter((item) => (!afterId || item.id > afterId) && !excluded.includes(item.id))
				.slice(0, limit),
			nextBoundary: null,
		}),
	)
}

/**
 * Creates a timed successful outcome.
 * @param value - Selected fixture.
 * @returns Settled result.
 */
function updated(value: MetadataFile): FileResult {
	return { id: value.id, status: 'updated', fields: ['description'], durationMs: 1 }
}

describe('regeneration queue', () => {
	it.each([0, 101, 1.5, '10'])('rejects invalid concurrency %s', (concurrency) => {
		expect(backfillOptionsSchema.safeParse({ concurrency }).success).toBe(false)
	})
	it.each([1, 100])('accepts concurrency %s with sequential default', (concurrency) => {
		expect(backfillOptionsSchema.parse({ concurrency }).concurrency).toBe(concurrency)
		expect(backfillOptionsSchema.parse({}).concurrency).toBe(1)
	})
	it.each([10, 50])(
		'refills immediately across a %s-slot boundary and retains selection order',
		async (concurrency) => {
			const files = Array.from({ length: concurrency + 1 }, (_, index) => file(index))
			const gates = files.map(deferred)
			const started: string[] = []
			let active = 0
			let peak = 0
			const results: FileResult[] = []
			const pending = runRegenerationQueue(
				backfillOptionsSchema.parse({ concurrency }),
				reader(files),
				async (value) => {
					started.push(value.id)
					active += 1
					peak = Math.max(peak, active)
					await gates[files.indexOf(value)]?.promise
					active -= 1
					return Promise.resolve(updated(value))
				},
				vi.fn(),
				results,
			)
			await vi.waitFor(() => expect(started).toHaveLength(concurrency))
			gates[0]?.resolve()
			await vi.waitFor(() => expect(started).toHaveLength(concurrency + 1))
			expect(active).toBe(concurrency)
			for (const gate of gates) gate.resolve()
			await pending
			expect(peak).toBe(concurrency)
			expect(results.map((value) => value.id)).toEqual(files.map((value) => value.id))
		},
	)
	it('drains over 1000 moving candidates with no offset, duplicates, or page barriers', async () => {
		const files = Array.from({ length: 1101 }, (_, index) => file(index))
		const selected: string[] = []
		for (let invocation = 0; invocation < 12; invocation += 1) {
			const results: FileResult[] = []
			const options = backfillOptionsSchema.parse({ concurrency: 10 })
			const output = await runRegenerationQueue(
				options,
				async (...args) => {
					const missing = files.filter((value) => hasMissingMetadata(value, options))
					return reader(missing)(...args)
				},
				(value) => {
					value.description = 'Complete'
					return Promise.resolve(updated(value))
				},
				(value) => selected.push(value),
				results,
			)
			expect(results.length).toBeLessThanOrEqual(100)
			if (output.complete) break
		}
		expect(selected).toHaveLength(1101)
		expect(new Set(selected).size).toBe(1101)
	})
	it('does not charge refined complete rows to maxFiles; bounds coarse scanning and exposes continuation', async () => {
		const files = Array.from({ length: 1002 }, (_, index) => ({
			...file(index),
			description: ' Complete',
		}))
		const results: FileResult[] = []
		const output = await runRegenerationQueue(
			backfillOptionsSchema.parse({ maxFiles: 1 }),
			reader(files),
			(value) => Promise.resolve(updated(value)),
			vi.fn(),
			results,
		)
		expect(output).toMatchObject({
			scanned: 0,
			inspected: 1000,
			remaining: true,
			complete: false,
			nextCursor: id(999),
		})
		expect(results).toEqual([])
	})
	it('caps admission below concurrency, continues by keyset, and allows exclusion of permanent failures', async () => {
		const files = Array.from({ length: 4 }, (_, index) => file(index))
		const options = backfillOptionsSchema.parse({
			concurrency: 100,
			maxFiles: 1,
			missingOnly: false,
			excludeFiles: [id(0)],
		})
		const results: FileResult[] = []
		const first = await runRegenerationQueue(
			options,
			reader(files),
			(value) => Promise.resolve(updated(value)),
			vi.fn(),
			results,
		)
		expect(results.map((value) => value.id)).toEqual([id(1)])
		expect(first.nextCursor).toBe(id(1))
		files.shift()
		const next: FileResult[] = []
		await runRegenerationQueue(
			{ ...options, afterId: first.nextCursor },
			reader(files),
			(value) => Promise.resolve(updated(value)),
			vi.fn(),
			next,
		)
		expect(next.map((value) => value.id)).toEqual([id(2)])
	})
	it('settles active jobs before rejecting a fatal processor or query error', async () => {
		const files = Array.from({ length: 4 }, (_, index) => file(index))
		const gate = deferred()
		const started: string[] = []
		const results: FileResult[] = []
		const pending = runRegenerationQueue(
			backfillOptionsSchema.parse({ concurrency: 2 }),
			reader(files),
			async (value) => {
				started.push(value.id)
				if (value.id === id(0)) {
					await gate.promise
					return Promise.resolve(updated(value))
				}
				throw new Error('fatal')
			},
			vi.fn(),
			results,
		)
		const rejection = expect(pending).rejects.toThrow('fatal')
		await vi.waitFor(() => expect(started).toHaveLength(2))
		gate.resolve()
		await rejection
		expect(started).toHaveLength(2)
		expect(results).toEqual([updated(file(0))])
	})
	it('refills on isolated failures and skips without readmitting IDs', async () => {
		const files = Array.from({ length: 101 }, (_, index) => file(index))
		const results: FileResult[] = []
		await runRegenerationQueue(
			backfillOptionsSchema.parse({ concurrency: 10, maxFiles: 101 }),
			reader(files),
			(value): Promise<FileResult> =>
				Promise.resolve(
					value.id === id(0)
						? {
								id: value.id,
								status: 'failed',
								fields: [],
								durationMs: 1,
								error: {
									stage: 'generate',
									code: 'PROVIDER_FAILED',
									message: 'Failed',
									retryable: false,
								},
							}
						: { id: value.id, status: 'skipped', fields: [], durationMs: 1 },
				),
			vi.fn(),
			results,
		)
		expect(results).toHaveLength(101)
		expect(new Set(results.map((value) => value.id)).size).toBe(101)
	})
	it('refills concurrency 10 across row 50 while nine prior jobs remain pending', async () => {
		const files = Array.from({ length: 51 }, (_, index) => file(index))
		const gates = files.map(deferred)
		const started: string[] = []
		const results: FileResult[] = []
		const pending = runRegenerationQueue(
			backfillOptionsSchema.parse({ concurrency: 10 }),
			reader(files),
			async (value) => {
				started.push(value.id)
				const index = files.indexOf(value)
				if (index >= 40) await gates[index]?.promise
				return updated(value)
			},
			vi.fn(),
			results,
		)
		await vi.waitFor(() => expect(started).toHaveLength(50))
		gates[40]?.resolve()
		await vi.waitFor(() => expect(started).toHaveLength(51))
		for (const gate of gates) gate.resolve()
		await pending
		expect(results.map((value) => value.id)).toEqual(files.map((value) => value.id))
	})
	it('settles active work when the next prefetch rejects and stops admissions', async () => {
		const files = Array.from({ length: 51 }, (_, index) => file(index))
		const gate = deferred()
		const results: FileResult[] = []
		let queries = 0
		const pending = runRegenerationQueue(
			backfillOptionsSchema.parse({ concurrency: 10 }),
			(...args) => {
				queries += 1
				return queries === 1
					? reader(files)(...args)
					: Promise.reject(new Error('query failed'))
			},
			async (value) => {
				if (value.id >= id(41)) await gate.promise
				return updated(value)
			},
			vi.fn(),
			results,
		)
		const rejection = expect(pending).rejects.toThrow('query failed')
		await vi.waitFor(() => expect(queries).toBe(2))
		gate.resolve()
		await rejection
		expect(results).toHaveLength(50)
	})
	it('returns a continuation for sparse bounded index windows without claiming completion', async () => {
		const results: FileResult[] = []
		const output = await runRegenerationQueue(
			backfillOptionsSchema.parse({ afterId: id(0) }),
			() => Promise.resolve({ files: [], nextBoundary: id(1000) }),
			vi.fn(),
			vi.fn(),
			results,
		)
		expect(output).toMatchObject({
			scanned: 0,
			inspected: 1000,
			nextCursor: id(1000),
			complete: false,
			remaining: true,
		})
	})
	it('resumes after the last consumed file when maxFiles leaves a prefetched remainder', async () => {
		const files = [file(0), file(1), file(2), file(3)]
		const options = backfillOptionsSchema.parse({ missingOnly: false, maxFiles: 2 })
		const first = await runRegenerationQueue(
			options,
			reader(files),
			(value) => Promise.resolve(updated(value)),
			vi.fn(),
			[],
		)
		expect(first.nextCursor).toBe(id(1))
		const results: FileResult[] = []
		await runRegenerationQueue(
			{ ...options, afterId: first.nextCursor },
			reader(files),
			(value) => Promise.resolve(updated(value)),
			vi.fn(),
			results,
		)
		expect(results.map((result) => result.id)).toEqual([id(2), id(3)])
	})
	it('rejects ambiguous nonempty pages with a separate continuation boundary', async () => {
		await expect(
			runRegenerationQueue(
				backfillOptionsSchema.parse({}),
				() => Promise.resolve({ files: [file(0)], nextBoundary: id(2) }),
				(value) => Promise.resolve(updated(value)),
				vi.fn(),
				[],
			),
		).rejects.toThrow('nonempty candidate page')
	})
	it('defaults blank overrides without hiding invalid types', () => {
		expect(
			backfillOptionsSchema.parse({
				language: '  ',
				provider: '\t',
				model: ' ',
				prompt: '\n',
			}),
		).toMatchObject({
			language: undefined,
			provider: undefined,
			model: undefined,
			prompt: undefined,
		})
		for (const key of ['language', 'provider', 'model', 'prompt'])
			expect(backfillOptionsSchema.safeParse({ [key]: 42 }).success).toBe(false)
	})
	it('exposes settled results and the original restart boundary on fatal regeneration errors', () => {
		const run = createRunDiagnostics('ai-image-metadata-regenerate')
		const results = [updated(file(0))]
		const error = new MetadataRegenerationError({
			summary: run.summary(false, true),
			results,
			restartAfterId: id(0),
		})
		expect(error.code).toBe('AI_METADATA_WRITER_REGENERATION_FAILED')
		expect(error.extensions).toMatchObject({
			results,
			restartAfterId: id(0),
			summary: { complete: false },
		})
	})
	it('rejects removed numeric-offset options', () => {
		expect(backfillOptionsSchema.safeParse({ offset: 0 }).success).toBe(false)
	})
})
