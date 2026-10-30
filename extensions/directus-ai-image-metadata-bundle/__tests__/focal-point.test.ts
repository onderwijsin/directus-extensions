import { describe, expect, it } from 'vitest'

import { metadataAppOptions } from '../src/shared/configuration/app-options'
import {
	createMetadataSchema,
	fileSchema,
	optionsSchema,
} from '../src/shared/configuration/options'
import {
	focalPointPatch,
	focalPointSchema,
	hasFocalPoint,
	matchesFocalPointDimensions,
} from '../src/shared/focal-point/focal-point'
import {
	createMetadataPatch,
	hasMissingMetadata,
	needsMetadataUpdate,
} from '../src/shared/metadata/metadata'

const file = fileSchema.parse({
	id: '11111111-1111-4111-8111-111111111111',
	type: 'image/png',
	folder: null,
	description: '  Human\ntext  ',
	tags: '["manual", " tag "]',
	filename_download: 'Manual Name.PNG',
	width: 800,
	height: 600,
})
const options = optionsSchema.parse({ generateAltText: false, generateFocalPoint: true })
const generated = {
	focalPoint: { x: 250, y: 600 },
	altText: 'Unused',
	tags: ['unused'],
	filename: 'unused',
}

describe('focal point domain', () => {
	it.each([
		[
			{ x: 0, y: 0 },
			{ focal_point_x: 0, focal_point_y: 0 },
		],
		[
			{ x: 500, y: 500 },
			{ focal_point_x: 400, focal_point_y: 300 },
		],
		[
			{ x: 1000, y: 1000 },
			{ focal_point_x: 799, focal_point_y: 599 },
		],
		[
			{ x: 250, y: 600 },
			{ focal_point_x: 200, focal_point_y: 360 },
		],
	])('maps normalized coordinates %j to original pixels', (point, expected) => {
		expect(focalPointPatch(point, file)).toEqual(expected)
	})
	it('rounds fractional pixels and handles a one-pixel image', () => {
		expect(focalPointPatch({ x: 500, y: 500 }, { width: 3, height: 5 })).toEqual({
			focal_point_x: 2,
			focal_point_y: 3,
		})
		expect(focalPointPatch({ x: 1000, y: 1000 }, { width: 1, height: 1 })).toEqual({
			focal_point_x: 0,
			focal_point_y: 0,
		})
	})
	it.each([-1, 1001, 0.5, NaN, Infinity, null, '500', undefined])(
		'rejects invalid model coordinates %s',
		(x) => {
			expect(focalPointSchema.safeParse({ x, y: 500 }).success).toBe(false)
			expect(focalPointPatch({ x, y: 500 }, file)).toBeUndefined()
			expect(focalPointPatch({ x: 500, y: x }, file)).toBeUndefined()
		},
	)
	it.each([0, -1, 1.5, NaN, Infinity, null, undefined, 2_147_483_648])(
		'skips unsafe dimension %s',
		(width) => {
			expect(focalPointPatch(generated.focalPoint, { width, height: 600 })).toBeUndefined()
			expect(
				focalPointPatch(generated.focalPoint, { width: 800, height: width }),
			).toBeUndefined()
		},
	)
	it('checks oriented WebP dimensions without trusting a provider resize', () => {
		const webp = Buffer.alloc(30)
		webp.write('RIFF')
		webp.writeUInt32LE(22, 4)
		webp.write('WEBPVP8X', 8)
		webp.writeUInt32LE(10, 16)
		webp.writeUIntLE(799, 24, 3)
		webp.writeUIntLE(599, 27, 3)
		expect(matchesFocalPointDimensions(webp, file)).toBe(true)
		expect(matchesFocalPointDimensions(webp, { width: 600, height: 800 })).toBe(false)
		expect(matchesFocalPointDimensions(webp.subarray(0, 16), file)).toBe(false)
	})
	it.each([
		{ focal_point_x: null, focal_point_y: null },
		{ focal_point_x: 55, focal_point_y: null },
		{ focal_point_x: null, focal_point_y: 55 },
	])('replaces incomplete pairs atomically, preserving every text byte: %j', (pair) => {
		const current = { ...file, ...pair }
		expect(hasFocalPoint(current)).toBe(false)
		expect(hasMissingMetadata(current, options)).toBe(true)
		expect(needsMetadataUpdate(current, options)).toBe(true)
		const patch = createMetadataPatch(current, generated, options)
		expect(patch).toEqual({ focal_point_x: 200, focal_point_y: 360 })
		for (const key of ['description', 'tags', 'filename_download'])
			expect(patch).not.toHaveProperty(key)
		expect({ ...current, ...patch }).toMatchObject({
			description: file.description,
			tags: file.tags,
			filename_download: file.filename_download,
		})
	})
	it('preserves complete manual edge coordinates, and overwrites only when enabled', () => {
		const current = { ...file, focal_point_x: 0, focal_point_y: 0 }
		expect(hasFocalPoint(current)).toBe(true)
		expect(hasMissingMetadata(current, options)).toBe(false)
		expect(needsMetadataUpdate(current, options)).toBe(false)
		expect(createMetadataPatch(current, generated, options)).toEqual({})
		expect(
			createMetadataPatch(current, generated, { ...options, overwriteFocalPoint: true }),
		).toEqual({ focal_point_x: 200, focal_point_y: 360 })
		expect(
			createMetadataPatch(current, generated, {
				...options,
				generateFocalPoint: false,
				overwriteFocalPoint: true,
			}),
		).toEqual({})
	})
	it('leaves missing text missing in focal-only mode and skips invalid dimensions', () => {
		expect(
			createMetadataPatch(
				{ ...file, description: null, tags: null, filename_download: null },
				generated,
				options,
			),
		).toEqual({ focal_point_x: 200, focal_point_y: 360 })
		expect(createMetadataPatch({ ...file, width: null }, generated, options)).toEqual({})
		expect(needsMetadataUpdate({ ...file, width: null }, options)).toBe(false)
		expect(
			createMetadataPatch({ ...file, width: null, description: null }, generated, {
				...options,
				generateAltText: true,
			}),
		).toEqual({ description: 'Unused' })
	})
	it('requires requested focal output and strips every disabled text output', () => {
		const schema = createMetadataSchema(options)
		expect(schema.parse(generated)).toEqual({ focalPoint: generated.focalPoint })
		expect(schema.safeParse({}).success).toBe(false)
		expect(schema.safeParse({ focalPoint: { x: 1001, y: 500 } }).success).toBe(false)
	})
	it('keeps defaults and Studio overwrite visibility consistent', () => {
		expect(optionsSchema.parse({})).toMatchObject({
			generateAltText: true,
			generateFocalPoint: false,
			overwriteFocalPoint: false,
		})
		expect(optionsSchema.safeParse({ generateFocalPoint: 'true' }).success).toBe(false)
		expect(
			metadataAppOptions.find((option) => option.field === 'generateFocalPoint')?.schema,
		).toEqual({ default_value: false })
		expect(
			metadataAppOptions.find((option) => option.field === 'overwriteFocalPoint')?.meta
				.conditions,
		).toEqual([{ rule: { generateFocalPoint: { _neq: true } }, hidden: true }])
	})
})
