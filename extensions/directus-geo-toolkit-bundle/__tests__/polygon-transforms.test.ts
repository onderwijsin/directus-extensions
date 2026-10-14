import type { Position } from '../src/shared/geometry'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { centroidOptionsSchema } from '../src/calculate-centroid-operation/utils/options.schema'
import { transformPayload as centroid } from '../src/calculate-centroid-operation/utils/transform'
import { gridOptionsSchema } from '../src/polygon-grid-points-operation/utils/options.schema'
import { transformPayload as grid } from '../src/polygon-grid-points-operation/utils/transform'
import { geoJsonPointSchema } from '../src/shared/geometry.schema'
import { createLocalProjection } from '../src/shared/projection'

const projection = createLocalProjection([0, 0])
const square: Position[] = [
	[-10, -10],
	[10, -10],
	[10, 10],
	[-10, 10],
	[-10, -10],
]
const hole: Position[] = [
	[0, 0],
	[4, 0],
	[4, 4],
	[0, 4],
	[0, 0],
]
const pointsSchema = z.object({
	grid_points: z.object({
		type: z.literal('MultiPoint'),
		coordinates: z.array(z.tuple([z.number(), z.number()])),
	}),
})

/**
 * Creates a WGS84 polygon with analytically known local geometry.
 * @param rings - Closed rings in local kilometres.
 * @returns GeoJSON Polygon.
 */
function polygon(rings: Position[][] = [square]) {
	return { type: 'Polygon', coordinates: rings.map((ring) => ring.map(projection.inverse)) }
}

/**
 * Runs the centroid transform with validated configuration.
 * @param payload - Incoming item or array.
 * @param options - Configuration overrides.
 * @returns Complete payload.
 */
function runCentroid(payload: unknown, options: Record<string, unknown> = {}) {
	return centroid(payload, centroidOptionsSchema.parse(options))
}

/**
 * Runs the grid transform with validated configuration.
 * @param payload - Incoming item or array.
 * @param options - Configuration overrides.
 * @returns Complete payload.
 */
function runGrid(payload: unknown, options: Record<string, unknown> = {}) {
	return grid(payload, gridOptionsSchema.parse(options))
}

describe('polygon transforms', () => {
	it('uses an equal-area projection with known equatorial coordinates and a stable inverse', () => {
		const [x, y] = projection.forward([1, 0])
		expect(x).toBeCloseTo(2 * 6371.0088 * Math.sin(Math.PI / 360), 9)
		expect(y).toBe(0)
		const centers: Position[] = [
			[4.9, 52.3],
			[-73.98, 40.75],
			[0, 0],
		]
		for (const center of centers) {
			const local = createLocalProjection(center)
			const point: Position = [center[0] + 0.1, center[1] + 0.2]
			const result = local.inverse(local.forward(point))
			expect(result[0]).toBeCloseTo(point[0], 10)
			expect(result[1]).toBeCloseTo(point[1], 10)
		}
	})
	it('returns a complete immutable payload, accepting Polygon Features and custom keys', () => {
		const payload = {
			title: 'Area',
			bounds: { type: 'Feature', properties: { name: 'Area' }, geometry: polygon() },
		}
		const original = structuredClone(payload)
		const result = runCentroid(payload, { inputField: 'bounds', outputField: 'center' })
		expect(result).toMatchObject({ ...payload, center: { type: 'Point', coordinates: [0, 0] } })
		expect(payload).toEqual(original)
	})
	it('subtracts holes by area regardless of winding and permits a centroid outside the filled region', () => {
		const rightHole: Position[] = [
			[2, -2],
			[6, -2],
			[6, 2],
			[2, 2],
			[2, -2],
		]
		const expectedX = (-16 * 4) / (400 - 16)
		for (const rings of [
			[square, rightHole],
			[[...square].reverse(), [...rightHole].reverse()],
		]) {
			const result = z
				.object({ centroid: geoJsonPointSchema })
				.parse(runCentroid({ polygon: polygon(rings) }))
			expect(projection.forward(result.centroid.coordinates)[0]).toBeCloseTo(expectedX, 5)
		}
		const centeredHole: Position[] = [
			[-2, -2],
			[2, -2],
			[2, 2],
			[-2, 2],
			[-2, -2],
		]
		expect(runCentroid({ polygon: polygon([square, centeredHole]) })).toMatchObject({
			centroid: { coordinates: [0, 0] },
		})
	})
	it('offers the reference spherical vertex average without double-counting the closing vertex', () => {
		const shape = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[2, 0],
					[0, 2],
					[0, 0],
				],
			],
		}
		const result = z
			.object({ centroid: geoJsonPointSchema })
			.parse(runCentroid({ polygon: shape }, { method: 'spherical-vertex' }))
		expect(result.centroid.coordinates[0]).toBeCloseTo(2 / 3, 3)
		expect(result.centroid.coordinates[1]).toBeCloseTo(2 / 3, 3)
		expect(() =>
			runCentroid({ polygon: polygon([square, hole]) }, { method: 'spherical-vertex' }),
		).toThrow('does not support polygon holes')
	})
	it('generates a complete ordered grid, excludes holes and honours metre units', () => {
		const payload = { title: 'Area', polygon: polygon([square, hole]) }
		const before = structuredClone(payload)
		const result = runGrid(payload)
		const points = pointsSchema.parse(result).grid_points.coordinates.map(projection.forward)
		expect(points).toHaveLength(3)
		expect(points[0]?.[0]).toBeCloseTo(-6, 5)
		expect(points[0]?.[1]).toBeCloseTo(-6, 5)
		expect(points[1]?.[0]).toBeCloseTo(2, 5)
		expect(points[2]?.[1]).toBeCloseTo(2, 5)
		expect(runGrid(payload, { spacing: 8000, units: 'meters' })).toEqual(result)
		expect(result).toMatchObject(payload)
		expect(payload).toEqual(before)
	})
	it('adapts spacing in both directions to meet the requested point-count bounds', () => {
		const dense = pointsSchema.parse(
			runGrid({ polygon: polygon() }, { spacing: 1, minPoints: 10, maxPoints: 25 }),
		)
		expect(dense.grid_points.coordinates.length).toBeGreaterThanOrEqual(10)
		expect(dense.grid_points.coordinates.length).toBeLessThanOrEqual(25)
		const sparse = pointsSchema.parse(
			runGrid({ polygon: polygon() }, { spacing: 100, minPoints: 16, maxPoints: 36 }),
		)
		expect(sparse.grid_points.coordinates.length).toBeGreaterThanOrEqual(16)
		expect(sparse.grid_points.coordinates.length).toBeLessThanOrEqual(36)
		const bounded = pointsSchema.parse(
			runGrid({ polygon: polygon() }, { spacing: 1, maxPoints: 4, maxCandidates: 4 }),
		)
		expect(bounded.grid_points.coordinates).toHaveLength(4)
	})
	it('applies boundary and vertex clearances independently and rejects unreachable targets', () => {
		const payload = { polygon: polygon() }
		expect(
			pointsSchema.parse(runGrid(payload, { minimumBoundaryDistance: 5 })).grid_points
				.coordinates,
		).toHaveLength(1)
		expect(
			pointsSchema.parse(runGrid(payload, { minimumVertexDistance: 6 })).grid_points
				.coordinates,
		).toHaveLength(3)
		expect(() => runGrid(payload, { minPoints: 1, minimumBoundaryDistance: 100 })).toThrow(
			'Cannot satisfy minPoints/maxPoints',
		)
	})
	it('handles empty output explicitly, without ignoring a positive minimum count', () => {
		const payload = { polygon: polygon() }
		expect(runGrid(payload, { spacing: 100 })).toMatchObject({ grid_points: null })
		expect(runGrid(payload, { spacing: 100, emptyResult: 'empty-multipoint' })).toMatchObject({
			grid_points: { type: 'MultiPoint', coordinates: [] },
		})
		expect(() => runGrid(payload, { spacing: 100, emptyResult: 'error' })).toThrow(
			'contains no points',
		)
	})
	it('preserves explicit overrides and partial updates, and clears destinations for null sources', () => {
		for (const transform of [runCentroid, runGrid]) {
			expect(transform({ title: 'Only title' })).toEqual({ title: 'Only title' })
			expect(() => transform({}, { missingInput: 'error' })).toThrow('missing source')
			expect(
				transform(
					{ polygon: null, result: 'Manual' },
					{ outputField: 'result', overwrite: 'preserve-input' },
				),
			).toEqual({ polygon: null, result: 'Manual' })
			expect(transform({ polygon: null }, { outputField: 'result' })).toEqual({
				polygon: null,
				result: null,
			})
			expect(transform({ polygon: null }, { nullInput: 'skip' })).toEqual({ polygon: null })
			expect(() => transform({ polygon: null }, { nullInput: 'error' })).toThrow(
				'null source',
			)
			for (const result of [0, false, ' ', 'Manual']) {
				expect(
					transform(
						{ polygon: polygon(), result },
						{ outputField: 'result', overwrite: 'fill-empty' },
					),
				).toEqual({ polygon: polygon(), result })
			}
			expect(transform([{ title: 'A' }, { title: 'B' }])).toEqual([
				{ title: 'A' },
				{ title: 'B' },
			])
		}
	})
	it('rejects invalid rings, intersections, unsupported geometries and configured limits', () => {
		const invalid = [
			{ type: 'Point', coordinates: [0, 0] },
			{
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[0, 1],
					],
				],
			},
			{
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 1],
						[1, 0],
						[0, 1],
						[0, 0],
					],
				],
			},
			{
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[2, 0],
						[0, 0],
					],
				],
			},
			polygon([
				square,
				[
					[11, 11],
					[12, 11],
					[12, 12],
					[11, 12],
					[11, 11],
				],
			]),
		]
		for (const transform of [runCentroid, runGrid]) {
			for (const source of invalid) expect(() => transform({ polygon: source })).toThrow()
			expect(() => transform({ polygon: polygon() }, { maxVertices: 3 })).toThrow(
				'maxVertices',
			)
			expect(() => transform({ polygon: polygon() }, { maxAreaKm2: 1 })).toThrow('maxAreaKm2')
			expect(() => transform([{ polygon: polygon() }, { polygon: {} }])).toThrow('Item 1:')
			expect(() => transform(null)).toThrow('object payload')
		}
		for (const options of [
			{ minPoints: 6, maxPoints: 5 },
			{ maxCandidates: 2, maxPoints: 3 },
			{ spacing: 0 },
			{ maxPoints: 0 },
			{ outputField: 'polygon' },
			{ outputField: '__proto__' },
		]) {
			expect(gridOptionsSchema.safeParse(options).success).toBe(false)
		}
	})
})
