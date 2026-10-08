import { isDirectusError } from '@directus/errors'
import { RetryError } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import { atStage, classifyFailure, ProcessingFailure } from '../src/shared/diagnostics'
import { backfillOptionsSchema } from '../src/shared/options'
import { createRunDiagnostics } from '../src/shared/run-diagnostics'

describe('safe image metadata diagnostics', () => {
	it.each([
		{ statusCode: 429, code: 'PROVIDER_RATE_LIMITED', retryable: true },
		{ statusCode: 503, code: 'PROVIDER_UNAVAILABLE', retryable: true },
		{ statusCode: 400, code: 'PROVIDER_REJECTED', retryable: false },
	])(
		'classifies provider HTTP $statusCode after exhausted retries',
		({ statusCode, code, retryable }) => {
			const error = new RetryError({
				message: 'SECRET',
				reason: 'maxRetriesExceeded',
				errors: [{ statusCode, message: 'SECRET', responseBody: 'PRIVATE' }],
			})
			const result = classifyFailure('generate', error)
			expect(result).toMatchObject({ code, retryable, httpStatus: statusCode })
			expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE/u)
		},
	)
	it('classifies read, timeout, validation and write boundaries safely', async () => {
		expect(classifyFailure('read_file', { status: 403 })).toMatchObject({
			code: 'FILE_INACCESSIBLE',
		})
		expect(
			classifyFailure('read_asset', new DOMException('SECRET', 'TimeoutError')),
		).toMatchObject({ code: 'TIMEOUT', retryable: true })
		expect(classifyFailure('read_bytes', { code: 'INVALID_PAYLOAD' })).toMatchObject({
			code: 'INVALID_IMAGE',
		})
		expect(classifyFailure('generate', { name: 'AI_NoOutputGeneratedError' })).toMatchObject({
			code: 'INVALID_OUTPUT',
		})
		await expect(
			atStage('write_metadata', () => Promise.reject(new Error('SECRET'))),
		).rejects.toEqual(new ProcessingFailure(classifyFailure('write_metadata', {})))
	})
	it('counts mixed outcomes, deduplicates candidates and excludes private options', () => {
		const run = createRunDiagnostics('ai-image-metadata-regenerate')
		run.setOptions(backfillOptionsSchema.parse({ prompt: 'SECRET' }))
		run.setProvider({ provider: 'mistral', model: 'pixtral-large-latest', apiKey: 'SECRET' })
		for (const id of ['first', 'second', 'third', 'first']) run.found.add(id)
		for (const id of ['first', 'second', 'third']) {
			run.attempt(id)
			run.results.push(
				id === 'second'
					? {
							id,
							status: 'failed',
							fields: [],
							durationMs: 1,
							error: classifyFailure('generate', { statusCode: 429 }),
						}
					: { id, status: 'updated', fields: ['description'], durationMs: 1 },
			)
		}
		const summary = run.summary(true)
		expect(summary).toMatchObject({
			filesFound: 3,
			filesAttempted: 3,
			filesUpdated: 2,
			filesSkipped: 0,
			filesFailed: 1,
			complete: false,
			hasFailures: true,
			outcome: 'partial_failure',
			options: { concurrency: 1 },
		})
		expect(JSON.stringify(summary)).not.toContain('SECRET')
		expect(summary.durationMs).toBeGreaterThanOrEqual(0)
	})
	it('distinguishes exhausted, capped and fatal runs', () => {
		const run = createRunDiagnostics('ai-image-metadata-regenerate')
		expect(run.summary(true)).toMatchObject({ complete: true, outcome: 'success' })
		expect(run.summary(false)).toMatchObject({ complete: false, hasFailures: false })
		expect(run.summary(true, true)).toMatchObject({
			complete: false,
			hasFailures: true,
			outcome: 'failed',
		})
	})
})

describe('file failure isolation', () => {
	it('persists both successes around a failed provider call in selection order', async () => {
		const { settleFile } = await import('../src/shared/diagnostics')
		const persisted: string[] = []
		const logs: unknown[] = []
		const results = []
		for (const id of ['first', 'second', 'third']) {
			results.push(
				await settleFile(
					id,
					() =>
						atStage('generate', () => {
							if (id === 'second')
								return Promise.reject(
									Object.assign(new Error('SECRET'), { statusCode: 429 }),
								)
							persisted.push(id)
							return Promise.resolve({
								id,
								status: 'updated',
								fields: ['description'],
							} satisfies import('../src/shared/contracts').MetadataWriteResult)
						}),
					true,
					(error) => logs.push(error),
				),
			)
		}
		expect(persisted).toEqual(['first', 'third'])
		expect(results.map((result) => result.status)).toEqual(['updated', 'failed', 'updated'])
		expect(logs).toHaveLength(1)
		expect(JSON.stringify({ results, logs })).not.toContain('SECRET')
	})
	it('rejects single-file failures and shared configuration/shutdown even with isolation', async () => {
		const { settleFile } = await import('../src/shared/diagnostics')
		for (const [stage, isolate] of [
			['generate', false],
			['resolve_provider', true],
			['shutdown', true],
		] satisfies [import('../src/shared/diagnostics').FailureStage, boolean][]) {
			await expect(
				settleFile(
					'file',
					() => atStage(stage, () => Promise.reject(new Error('SECRET'))),
					isolate,
					() => {
						/* Observed by caller. */
					},
				),
			).rejects.toBeInstanceOf(ProcessingFailure)
		}
	})
})

describe('Directus processing error and attempt boundaries', () => {
	it('carries only sanitized diagnostics through a Directus error', () => {
		const diagnostic = classifyFailure(
			'generate',
			Object.assign(new Error('SECRET'), { statusCode: 429 }),
		)
		const error = new ProcessingFailure(diagnostic)
		expect(isDirectusError(error)).toBe(true)
		expect(error.extensions).toEqual(diagnostic)
		expect(error.diagnostic).toEqual(diagnostic)
		expect(JSON.stringify(error)).not.toContain('SECRET')
	})
	it('preserves null and undefined successful values and classifies null rejections', async () => {
		await expect(atStage('generate', () => Promise.resolve(null))).resolves.toBeNull()
		await expect(atStage('generate', () => Promise.resolve(undefined))).resolves.toBeUndefined()
		await expect(
			atStage('generate', vi.fn<() => Promise<never>>().mockRejectedValue(null)),
		).rejects.toBeInstanceOf(ProcessingFailure)
	})
})
