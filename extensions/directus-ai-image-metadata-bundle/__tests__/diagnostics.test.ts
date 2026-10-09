import { isDirectusError } from '@directus/errors'
import { NoObjectGeneratedError, RetryError } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { backfillOptionsSchema, writerOptionsSchema } from '../src/shared/configuration/options'
import { atStage, classifyFailure, ProcessingFailure } from '../src/shared/diagnostics/diagnostics'
import { createRunDiagnostics } from '../src/shared/diagnostics/run-diagnostics'

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
			expect(result.raw).toMatchObject({
				message: 'SECRET',
				lastError: { responseBody: 'PRIVATE' },
			})
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
		).rejects.toEqual(
			new ProcessingFailure(classifyFailure('write_metadata', new Error('SECRET'))),
		)
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
							transformed: false,
							originalMimeType: 'image/png',
							transformationDurationMs: 0,
							error: classifyFailure('generate', { statusCode: 429 }),
						}
					: {
							id,
							status: 'updated',
							fields: ['description'],
							durationMs: 1,
							transformed: false,
							originalMimeType: 'image/png',
							transformationDurationMs: 0,
						},
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
	it('counts completed conversions by original MIME even when the provider subsequently fails', async () => {
		const { settleFile } = await import('../src/shared/diagnostics/diagnostics')
		const run = createRunDiagnostics('ai-image-metadata-regenerate')
		for (const [id, mime, transformed, failure] of [
			['converted', 'image/avif', true, false],
			['provider-failure', 'image/tiff', true, true],
			['conversion-failure', 'image/avif', false, true],
			['original', 'image/png', false, false],
		] satisfies [string, string, boolean, boolean][]) {
			const result = await settleFile(
				id,
				() =>
					failure
						? atStage(transformed ? 'generate' : 'convert_image', () =>
								Promise.reject(new Error('PRIVATE')),
							)
						: Promise.resolve({ id, status: 'updated', fields: ['description'] }),
				true,
				vi.fn(),
				{
					transformed,
					originalMimeType: mime,
					transformationDurationMs: mime === 'image/png' ? 0 : 12,
				},
			)
			expect(result).toMatchObject({
				transformed,
				originalMimeType: mime,
				transformationDurationMs: mime === 'image/png' ? 0 : 12,
			})
			run.results.push(result)
		}
		expect(run.summary(false)).toMatchObject({
			assetsTransformed: 2,
			transformsByMimeType: { 'image/avif': 1, 'image/tiff': 1 },
		})
		expect(run.summary(false, true)).toMatchObject({
			assetsTransformed: 2,
			transformsByMimeType: { 'image/avif': 1, 'image/tiff': 1 },
		})
		expect(JSON.stringify(run.summary(false))).not.toContain('PRIVATE')
	})
	it('reports no transformation for skipped or unreadable files and empty runs', async () => {
		const { settleFile } = await import('../src/shared/diagnostics/diagnostics')
		const result = await settleFile(
			'skipped',
			() => Promise.resolve({ id: 'skipped', status: 'skipped', fields: [] }),
			true,
			vi.fn(),
		)
		expect(result).toMatchObject({
			transformed: false,
			originalMimeType: null,
			transformationDurationMs: 0,
		})
		const unreadable = await settleFile(
			'unreadable',
			() =>
				atStage('read_file', () =>
					Promise.reject(Object.assign(new Error('PRIVATE'), { statusCode: 403 })),
				),
			true,
			vi.fn(),
		)
		expect(unreadable).toMatchObject({
			status: 'failed',
			transformed: false,
			originalMimeType: null,
			transformationDurationMs: 0,
		})
		expect(createRunDiagnostics('test').summary(true)).toMatchObject({
			assetsTransformed: 0,
			transformsByMimeType: {},
		})
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
		const { settleFile } = await import('../src/shared/diagnostics/diagnostics')
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
							} satisfies import('../src/shared/processing/contracts').MetadataWriteResult)
						}),
					true,
					(error) => logs.push(error),
				),
			)
		}
		expect(persisted).toEqual(['first', 'third'])
		expect(results.map((result) => result.status)).toEqual(['updated', 'failed', 'updated'])
		expect(logs).toHaveLength(1)
		expect(JSON.stringify({ results, logs })).toContain('SECRET')
	})
	it('rejects single-file failures and shared configuration/shutdown even with isolation', async () => {
		const { settleFile } = await import('../src/shared/diagnostics/diagnostics')
		for (const [stage, isolate] of [
			['generate', false],
			['resolve_provider', true],
			['shutdown', true],
		] satisfies [import('../src/shared/diagnostics/diagnostics').FailureStage, boolean][]) {
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
	it('carries captured diagnostics through a Directus error', () => {
		const diagnostic = classifyFailure(
			'generate',
			Object.assign(new Error('SECRET'), { statusCode: 429 }),
		)
		const error = new ProcessingFailure(diagnostic)
		expect(isDirectusError(error)).toBe(true)
		expect(error.extensions).toEqual(diagnostic)
		expect(error.diagnostic).toEqual(diagnostic)
		expect(error.diagnostic.raw).toMatchObject({ message: 'SECRET' })
	})
	it('preserves null and undefined successful values and classifies null rejections', async () => {
		await expect(atStage('generate', () => Promise.resolve(null))).resolves.toBeNull()
		await expect(atStage('generate', () => Promise.resolve(undefined))).resolves.toBeUndefined()
		await expect(
			atStage('generate', vi.fn<() => Promise<never>>().mockRejectedValue(null)),
		).rejects.toBeInstanceOf(ProcessingFailure)
	})
})

describe('captured upstream diagnostics', () => {
	it('retains SDK output, nested validation rules and parsed values', () => {
		const value = { altText: '', tags: [42] }
		const parsed = z
			.object({ altText: z.string().min(1), tags: z.array(z.string()) })
			.safeParse(value)
		if (parsed.success) throw new Error('Expected invalid fixture')
		const error = new NoObjectGeneratedError({
			text: JSON.stringify(value),
			cause: Object.assign(new Error('Validation failed'), { value, cause: parsed.error }),
			response: { id: 'response-id', timestamp: new Date(), modelId: 'vision' },
			usage: {
				inputTokens: undefined,
				outputTokens: undefined,
				totalTokens: undefined,
				inputTokenDetails: {
					noCacheTokens: undefined,
					cacheReadTokens: undefined,
					cacheWriteTokens: undefined,
				},
				outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
			},
			finishReason: 'stop',
		})
		const result = classifyFailure('generate', error)
		expect(result).toMatchObject({
			code: 'INVALID_OUTPUT',
			raw: { text: JSON.stringify(value), cause: { value } },
			issues: [
				{ code: 'too_small', path: ['altText'] },
				{ code: 'invalid_type', path: ['tags', 0] },
			],
		})
		expect(result.validation).toContain('altText')
		expect(result.validation).toContain('tags[0]')
		expect(() => JSON.stringify(result)).not.toThrow()
	})
	it('bounds circular data and excludes request configuration', () => {
		const error = Object.assign(new Error('Connection reset'), {
			code: 'ECONNRESET',
			requestBody: 'PRIVATE',
			apiKey: 'SECRET',
			headers: { authorization: 'SECRET' },
			value: { token: 'SECRET', description: 'a'.repeat(20000) },
		})
		error.cause = error
		const result = classifyFailure('generate', error)
		expect(result).toMatchObject({
			code: 'CONNECTION_FAILED',
			raw: { message: 'Connection reset' },
		})
		expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SECRET/u)
		expect(JSON.stringify(result)).toContain('[circular]')
		expect(JSON.stringify(result)).toContain('[truncated]')
	})
	it('records normalized upload options without regeneration fields or prompts', () => {
		const run = createRunDiagnostics('ai-image-metadata')
		const id = 'bd3d0c49-ec7f-4d0e-a0b5-905f80596a47'
		run.setOptions(
			writerOptionsSchema.parse({
				files: id,
				prompt: 'PRIVATE',
				language: 'Dutch',
				generateTags: true,
				overwriteTags: true,
			}),
		)
		const summary = run.summary(true)
		expect(summary.options).toMatchObject({
			files: [id],
			language: 'Dutch',
			generateAltText: true,
			generateTags: true,
			overwriteTags: true,
			includeFolders: [],
			excludeFolders: [null],
		})
		expect(summary.options).not.toHaveProperty('maxFiles')
		expect(JSON.stringify(summary)).not.toContain('PRIVATE')
	})
})

it('preserves generation details on the single-file rejection branch', async () => {
	const { safeMetadataError } = await import('../src/shared/processing/execution')
	const error = new ProcessingFailure(classifyFailure('generate', new Error('Provider details')))
	expect(safeMetadataError(error)).toMatchObject({
		code: 'AI_METADATA_WRITER_GENERATION_FAILED',
		extensions: { error: error.diagnostic },
	})
})

describe('failure classification precedence', () => {
	it.each([
		{
			stage: 'generate',
			error: { name: 'AbortError', statusCode: 429 },
			code: 'RUN_ABORTED',
			retryable: false,
			expectedStage: 'shutdown',
		},
		{
			stage: 'generate',
			error: { name: 'TimeoutError', statusCode: 503 },
			code: 'TIMEOUT',
			retryable: true,
			expectedStage: 'generate',
		},
		{
			stage: 'convert_image',
			error: { name: 'TimeoutError' },
			code: 'IMAGE_TRANSFORM_TIMEOUT',
			retryable: false,
			expectedStage: 'convert_image',
		},
		{
			stage: 'write_metadata',
			error: { name: 'TimeoutError' },
			code: 'TIMEOUT',
			retryable: false,
			expectedStage: 'write_metadata',
		},
		{
			stage: 'generate',
			error: { code: 'ECONNRESET', statusCode: 429 },
			code: 'CONNECTION_FAILED',
			retryable: true,
			expectedStage: 'generate',
		},
		{
			stage: 'read_file',
			error: { code: 'ECONNREFUSED', statusCode: 403 },
			code: 'CONNECTION_FAILED',
			retryable: false,
			expectedStage: 'read_file',
		},
		{
			stage: 'generate',
			error: { name: 'AI_NoObjectGeneratedError', statusCode: 400 },
			code: 'PROVIDER_REJECTED',
			retryable: false,
			expectedStage: 'generate',
		},
		{
			stage: 'resolve_provider',
			error: {},
			code: 'PROVIDER_CONFIGURATION_INVALID',
			retryable: false,
			expectedStage: 'resolve_provider',
		},
		{
			stage: 'write_metadata',
			error: {},
			code: 'WRITE_METADATA_FAILED',
			retryable: false,
			expectedStage: 'write_metadata',
		},
	] satisfies {
		stage: import('../src/shared/diagnostics/diagnostics').FailureStage
		error: unknown
		code: string
		retryable: boolean
		expectedStage: string
	}[])('preserves $code for $stage', ({ stage, error, code, retryable, expectedStage }) => {
		expect(classifyFailure(stage, error)).toMatchObject({
			stage: expectedStage,
			code,
			retryable,
		})
	})
})

it.each([false, true])('explains the normalized root marker for includeRoot=%s', (includeRoot) => {
	const includeFolder = '8dfa6982-e335-416d-8cab-c057af43c8db'
	const excludeFolder = 'c913c973-1af8-45fb-b59a-fd8807f91b66'
	const run = createRunDiagnostics('ai-image-metadata-regenerate')
	run.setOptions(
		backfillOptionsSchema.parse({
			includeRoot,
			includeFolders: [{ collection: 'directus_folders', key: includeFolder }],
			excludeFolders: [{ collection: 'directus_folders', key: excludeFolder }],
		}),
	)
	expect(run.summary(true).options).toMatchObject({
		includeRoot,
		includeFolders: includeRoot ? [includeFolder, null] : [includeFolder],
		excludeFolders: includeRoot ? [excludeFolder] : [excludeFolder, null],
	})
})
