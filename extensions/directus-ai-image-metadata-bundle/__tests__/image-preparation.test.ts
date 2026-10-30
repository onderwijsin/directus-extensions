import type { TransformationDiagnostics } from '../src/shared/processing/contracts'

import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { metadataAppOptions } from '../src/shared/configuration/app-options'
import {
	fileSchema,
	optionsSchema,
	writerOptionsSchema,
	backfillOptionsSchema,
} from '../src/shared/configuration/options'
import { createRunDiagnostics } from '../src/shared/diagnostics/run-diagnostics'
import { planImagePreparation, prepareImage } from '../src/shared/files/image-preparation'
import { readWebpDimensions } from '../src/shared/files/webp-dimensions'
import { matchesFocalPointDimensions, focalPointPatch } from '../src/shared/focal-point/focal-point'

const defaults = optionsSchema.parse({})
const settings = {
	maxSizeBytes: defaults.maxImageSizeBytes,
	maxDimension: defaults.maxImageDimension,
	targetDimension: defaults.targetImageDimension,
}

const file = fileSchema.parse({
	id: '11111111-1111-4111-8111-111111111111',
	type: 'image/jpeg',
	folder: null,
	description: null,
	tags: null,
	filename_download: 'original.jpg',
	width: 1200,
	height: 900,
	filesize: '500000',
})

/**
 * Builds a canvas header for focused coordinate and byte-limit checks without pixel decoding.
 * @param width - Canvas width.
 * @param height - Canvas height.
 * @param length - Full container length, optionally including an opaque trailing chunk.
 * @returns Synthetic WebP header.
 */
function canvas(width: number, height: number, length = 30) {
	const bytes = Buffer.alloc(length)
	bytes.write('RIFF')
	bytes.writeUInt32LE(length - 8, 4)
	bytes.write('WEBPVP8X', 8)
	bytes.writeUInt32LE(10, 16)
	bytes.writeUIntLE(width - 1, 24, 3)
	bytes.writeUIntLE(height - 1, 27, 3)
	return bytes
}

describe('conditional image preparation', () => {
	it('defaults all three preparation settings for existing operations', () => {
		expect(settings).toEqual({
			maxSizeBytes: 500_000,
			maxDimension: 1500,
			targetDimension: 800,
		})
		for (const parsed of [
			writerOptionsSchema.parse({ files: file.id }),
			backfillOptionsSchema.parse({}),
		])
			expect(parsed).toMatchObject({
				maxImageSizeBytes: 500_000,
				maxImageDimension: 1500,
				targetImageDimension: 800,
			})
	})
	it('preserves saved size thresholds while emitting only the current option name', () => {
		for (const parsed of [
			optionsSchema.parse({ targetImageSizeBytes: 250_000 }),
			writerOptionsSchema.parse({ files: file.id, targetImageSizeBytes: 250_000 }),
			backfillOptionsSchema.parse({ targetImageSizeBytes: 250_000 }),
		]) {
			expect(parsed.maxImageSizeBytes).toBe(250_000)
			expect(parsed).not.toHaveProperty('targetImageSizeBytes')
		}
		for (const parsed of [
			writerOptionsSchema.parse({
				files: file.id,
				targetImageSizeBytes: 250_000,
				maxImageSizeBytes: 750_000,
			}),
			backfillOptionsSchema.parse({
				targetImageSizeBytes: 250_000,
				maxImageSizeBytes: 750_000,
			}),
		])
			expect(parsed.maxImageSizeBytes).toBe(750_000)
	})
	it.each([undefined, null, '', '   '])(
		'uses operation defaults for cleared settings: %s',
		(value) => {
			for (const parsed of [
				writerOptionsSchema.parse({
					files: file.id,
					maxImageSizeBytes: value,
					maxImageDimension: value,
					targetImageDimension: value,
				}),
				backfillOptionsSchema.parse({
					maxImageSizeBytes: value,
					maxImageDimension: value,
					targetImageDimension: value,
				}),
			])
				expect(parsed).toMatchObject({
					maxImageSizeBytes: 500_000,
					maxImageDimension: 1500,
					targetImageDimension: 800,
				})
		},
	)
	it('exposes all three numeric controls with matching Studio defaults', () => {
		for (const [field, value] of [
			['maxImageSizeBytes', 500_000],
			['maxImageDimension', 1500],
			['targetImageDimension', 800],
		])
			expect(metadataAppOptions.find((option) => option.field === field)).toMatchObject({
				type: 'integer',
				schema: { default_value: value },
				meta: { interface: 'input' },
			})
	})
	it.each([320, 1024, 2000])(
		'uses resize target %s, capped at the accepted maximum',
		(targetDimension) => {
			const source = { ...file, width: 2400, height: 1800 }
			const plan = planImagePreparation(source, false, { ...settings, targetDimension })
			const bound = Math.min(targetDimension, settings.maxDimension)
			expect(plan.resizeDimension).toBe(bound)
			expect(plan.transformation?.transformationParams.transforms).toEqual([
				[
					'resize',
					{ width: bound, height: bound, fit: 'inside', withoutEnlargement: true },
				],
			])
			expect(
				matchesFocalPointDimensions(
					canvas(bound, Math.round(bound * 0.75)),
					source,
					plan.resizeDimension,
				),
			).toBe(true)
		},
	)
	it('does not resize acceptable dimensions just because a smaller target was configured', () => {
		const plan = planImagePreparation({ ...file, filesize: 1_000_000 }, false, {
			...settings,
			targetDimension: 320,
		})
		expect(plan.resize).toBe(false)
		expect(plan.reasons).toEqual(['filesize'])
		expect(plan.transformation?.transformationParams.transforms).toBeUndefined()
	})
	it.each(['maxImageSizeBytes', 'maxImageDimension', 'targetImageDimension'])(
		'validates configured %s as a positive safe integer',
		(key) => {
			for (const value of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '500'])
				expect(optionsSchema.safeParse({ [key]: value }).success).toBe(false)
			expect(optionsSchema.parse({ [key]: 1000 })).toHaveProperty(key, 1000)
		},
	)
	it('uses configured settings for selecting transformations', () => {
		expect(
			planImagePreparation(file, false, { ...settings, maxSizeBytes: 250_000 }).reasons,
		).toEqual(['filesize'])
		expect(
			planImagePreparation({ ...file, filesize: 600_000 }, false, {
				...settings,
				maxSizeBytes: 750_000,
			}).transformation,
		).toBeUndefined()
		expect(planImagePreparation(file, false, { ...settings, maxDimension: 1000 }).resize).toBe(
			true,
		)
		expect(
			planImagePreparation({ ...file, width: 1800 }, false, {
				...settings,
				maxDimension: 2000,
			}).transformation,
		).toBeUndefined()
	})
	it('keeps the resize output within a configured maximum below 800 px', () => {
		const plan = planImagePreparation(file, true, { ...settings, maxDimension: 400 })
		expect(plan.resizeDimension).toBe(400)
		expect(plan.transformation?.transformationParams.transforms).toEqual([
			['resize', { width: 400, height: 400, fit: 'inside', withoutEnlargement: true }],
		])
		expect(matchesFocalPointDimensions(canvas(400, 300), file, plan.resizeDimension)).toBe(true)
	})
	it.each(['image/jpeg', 'image/png', 'image/webp'])(
		'preserves acceptable %s bytes at both upper settings',
		(type) => {
			expect(
				planImagePreparation({ ...file, type, width: 1500, height: 1500 }, false, settings)
					.transformation,
			).toBeUndefined()
		},
	)
	it.each([
		{ width: 1501, height: 1000 },
		{ width: 1000, height: 1501 },
		{ width: 4500, height: 100 },
	])('resizes oversized dimensions without crop, padding or enlargement: %j', (size) => {
		expect(planImagePreparation({ ...file, ...size }, false, settings)).toMatchObject({
			reasons: ['dimensions'],
			resize: true,
			mediaType: 'image/webp',
			transformation: {
				transformationParams: {
					format: 'webp',
					quality: 80,
					transforms: [
						[
							'resize',
							{ width: 800, height: 800, fit: 'inside', withoutEnlargement: true },
						],
					],
				},
			},
		})
	})
	it.each(['image/avif', 'image/tiff'])('converts %s without unnecessary resizing', (type) => {
		expect(planImagePreparation({ ...file, type }, false, settings)).toMatchObject({
			reasons: ['filetype'],
			resize: false,
			transformation: { transformationParams: { format: 'webp', quality: 80 } },
		})
	})
	it('compresses oversized and unknown byte sizes, and retains focal canonicalization', () => {
		for (const filesize of [500_001, null]) {
			const plan = planImagePreparation({ ...file, filesize }, false, settings)
			expect(plan.reasons).toEqual(filesize === null ? ['unknown_filesize'] : ['filesize'])
			expect(plan.transformation?.transformationParams.transforms).toBeUndefined()
		}
		expect(planImagePreparation(file, true, settings).reasons).toEqual(['focal_point'])
	})
	it.each([1, 249, 250])(
		'does not enlarge small images or narrow banners with short edge %s',
		(height) => {
			const plan = planImagePreparation({ ...file, width: 1200, height }, false, settings)
			expect(plan.transformation).toBeUndefined()
			expect(plan.smallImage).toBe(height < 250)
		},
	)
	it.each([null, 0, -1, 1.5, Infinity])(
		'fails preparation for unsafe dimensions: %s',
		(width) => {
			expect(() => planImagePreparation({ ...file, width }, false, settings)).toThrow()
		},
	)
	it('validates filesize strings without broad coercion', () => {
		expect(file.filesize).toBe(500_000)
		for (const filesize of ['', 'abc', '-1', true, 0.5, Number.MAX_SAFE_INTEGER + 1])
			expect(fileSchema.safeParse({ ...file, filesize }).success).toBe(false)
	})
	it('returns original bytes through one accountable acquisition', async () => {
		const bytes = await readFile(new URL('./fixtures/red.jpeg', import.meta.url))
		const acquire = vi.fn(() => Promise.resolve({ stream: Readable.from([bytes]) }))
		const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
		const result = await prepareImage({
			file,
			canonical: false,
			settings,
			signal: new AbortController().signal,
			maxBytes: 5_000_000,
			acquire,
			logger,
			diagnostics: {
				transformed: false,
				originalMimeType: file.type,
				transformationDurationMs: 0,
			},
		})
		expect(result.image).toEqual(bytes)
		expect(result.mediaType).toBe('image/jpeg')
		expect(acquire).toHaveBeenCalledExactlyOnceWith(undefined)
		expect(logger.warn).not.toHaveBeenCalled()
		expect(logger.info).not.toHaveBeenCalled()
	})
	it('exposes all triggers and before/after sizes at INFO and retains them after provider failure', async () => {
		const source = {
			...file,
			type: 'image/avif',
			width: 2400,
			height: 1800,
			filesize: 2_000_000,
		}
		const bytes = canvas(800, 600)
		const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
		const diagnostics: TransformationDiagnostics = {
			transformed: false,
			originalMimeType: source.type,
			transformationDurationMs: 0,
		}
		await prepareImage({
			file: source,
			canonical: true,
			settings,
			signal: new AbortController().signal,
			maxBytes: 5_000_000,
			acquire: () => Promise.resolve({ stream: Readable.from([bytes]) }),
			logger,
			diagnostics,
		})
		expect(diagnostics.imagePreparation).toEqual({
			reasons: ['dimensions', 'filesize', 'filetype', 'focal_point'],
			source: { width: 2400, height: 1800, sizeBytes: 2_000_000, mimeType: 'image/avif' },
			settings: { maxSizeBytes: 500_000, maxDimension: 1500, targetDimension: 800 },
			output: { width: 800, height: 600, sizeBytes: bytes.length, mimeType: 'image/webp' },
		})
		expect(logger.info).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ imagePreparation: diagnostics.imagePreparation }),
			expect.stringContaining('"sizeBytes":2000000'),
		)
		const { atStage, settleFile } = await import('../src/shared/diagnostics/diagnostics')
		const result = await settleFile(
			file.id,
			() => atStage('generate', () => Promise.reject(new Error('Provider fixture failure'))),
			true,
			vi.fn(),
			diagnostics,
		)
		expect(result.imagePreparation).toEqual(diagnostics.imagePreparation)
		const run = createRunDiagnostics('ai-image-metadata')
		run.results.push(result)
		expect(run.summary(false)).toMatchObject({
			assetsTransformed: 1,
			assetsOverMaxSize: 0,
			transformsByReason: { dimensions: 1, filesize: 1, filetype: 1, focal_point: 1 },
		})
	})
	it('retains the triggering source measurements when derivative acquisition fails', async () => {
		const diagnostics: TransformationDiagnostics = {
			transformed: false,
			originalMimeType: file.type,
			transformationDurationMs: 0,
		}
		await expect(
			prepareImage({
				file: { ...file, width: 2400, height: 1800, filesize: 2_000_000 },
				canonical: false,
				settings,
				signal: new AbortController().signal,
				maxBytes: 5_000_000,
				acquire: () => Promise.reject(new Error('Derivative fixture failure')),
				logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
				diagnostics,
			}),
		).rejects.toMatchObject({ diagnostic: { stage: 'convert_image' } })
		expect(diagnostics).toMatchObject({
			transformed: false,
			imagePreparation: {
				reasons: ['dimensions', 'filesize'],
				source: { width: 2400, height: 1800, sizeBytes: 2_000_000 },
				settings: { maxSizeBytes: 500_000, maxDimension: 1500, targetDimension: 800 },
				output: null,
			},
		})
	})
	it.each([250_000, 500_000, 750_000])(
		'warns once when output exceeds the configured target size %s',
		async (maxSizeBytes) => {
			const bytes = canvas(1200, 900, maxSizeBytes + 2)
			const acquire = vi.fn(() => Promise.resolve({ stream: Readable.from([bytes]) }))
			const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
			const diagnostics: TransformationDiagnostics = {
				transformed: false,
				originalMimeType: file.type,
				transformationDurationMs: 0,
			}
			const result = await prepareImage({
				file: { ...file, filesize: 1_000_000 },
				canonical: false,
				settings: { ...settings, maxSizeBytes },
				signal: new AbortController().signal,
				maxBytes: 5_000_000,
				acquire,
				logger,
				runId: 'run',
				diagnostics,
			})
			expect(result.image).toEqual(bytes)
			expect(acquire).toHaveBeenCalledTimes(1)
			expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					code: 'AI_METADATA_IMAGE_MAX_SIZE_EXCEEDED',
					fileId: file.id,
					runId: 'run',
					maxSizeBytes,
					outputBytes: maxSizeBytes + 2,
					bytesOverMaxSize: 2,
					submissionContinues: true,
					transformationReasons: ['filesize'],
				}),
				expect.stringContaining('AI_METADATA_IMAGE_MAX_SIZE_EXCEEDED'),
			)
			expect(diagnostics).toMatchObject({ transformed: true, imageMaxSizeExceeded: true })
			const run = createRunDiagnostics('ai-image-metadata')
			run.results.push({
				id: file.id,
				status: 'updated',
				fields: ['description'],
				durationMs: 1,
				...diagnostics,
			})
			expect(run.summary(true)).toMatchObject({
				assetsOverMaxSize: 1,
				assetsTransformed: 1,
				hasFailures: false,
				complete: true,
			})
		},
	)
	it('does not warn when output exceeds the default but fits a raised target size', async () => {
		const bytes = canvas(1200, 900, 600_002)
		const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
		const diagnostics: TransformationDiagnostics = {
			transformed: false,
			originalMimeType: file.type,
			transformationDurationMs: 0,
		}
		const result = await prepareImage({
			file: { ...file, filesize: 1_000_000 },
			canonical: false,
			settings: { ...settings, maxSizeBytes: 750_000 },
			maxBytes: 5_000_000,
			signal: new AbortController().signal,
			acquire: () => Promise.resolve({ stream: Readable.from([bytes]) }),
			logger,
			diagnostics,
		})
		expect(result.image).toEqual(bytes)
		expect(logger.warn).not.toHaveBeenCalled()
		expect(diagnostics.imageMaxSizeExceeded).toBeUndefined()
	})
	it('keeps the configured hard byte limit separate and destroys failed streams', async () => {
		const stream = Readable.from([canvas(1200, 900, 500_002)])
		const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
		await expect(
			prepareImage({
				file,
				canonical: true,
				settings,
				signal: new AbortController().signal,
				maxBytes: 100,
				acquire: () => Promise.resolve({ stream }),
				logger,
				diagnostics: {
					transformed: false,
					originalMimeType: file.type,
					transformationDurationMs: 0,
				},
			}),
		).rejects.toMatchObject({ diagnostic: { code: 'IMAGE_TRANSFORM_LIMIT_EXCEEDED' } })
		expect(stream.destroyed).toBe(true)
		expect(logger.warn).not.toHaveBeenCalled()
	})
	it('rejects a bypassed conversion rather than relabeling original bytes as WebP', async () => {
		await expect(
			prepareImage({
				file,
				canonical: true,
				settings,
				signal: new AbortController().signal,
				maxBytes: 5_000_000,
				acquire: () =>
					Promise.resolve({ stream: Readable.from([Buffer.from('original')]) }),
				logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
				diagnostics: {
					transformed: false,
					originalMimeType: file.type,
					transformationDurationMs: 0,
				},
			}),
		).rejects.toMatchObject({ diagnostic: { code: 'IMAGE_TRANSFORM_INVALID_INPUT' } })
	})
	it('maps a resized focal input back to original oriented pixels', () => {
		const original = { ...file, width: 2400, height: 1600 }
		const bytes = canvas(800, 533)
		expect(matchesFocalPointDimensions(bytes, original, 800)).toBe(true)
		expect(matchesFocalPointDimensions(bytes, original)).toBe(false)
		expect(matchesFocalPointDimensions(canvas(533, 800), original, 800)).toBe(false)
		expect(focalPointPatch({ x: 250, y: 750 }, original)).toEqual({
			focal_point_x: 600,
			focal_point_y: 1200,
		})
	})
	it('reads real Directus-compatible WebP headers and rejects truncation or animation', async () => {
		const bytes = await readFile(new URL('./fixtures/red.webp', import.meta.url))
		expect(readWebpDimensions(bytes)).toBeDefined()
		const animated = canvas(800, 600)
		animated.writeUInt8(2, 20)
		expect(readWebpDimensions(animated)).toBeUndefined()
		for (const length of [0, 12, 24, 29])
			expect(readWebpDimensions(bytes.subarray(0, length))).toBeUndefined()
	})
})
