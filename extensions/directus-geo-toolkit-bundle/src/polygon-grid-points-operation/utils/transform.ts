import type { Polygon, Position } from '../../shared/geometry'
import type { GridOptions } from './types'

import { isDefined, isFiniteNumber } from '@onderwijsin/directus-extension-utils'

import {
	insideRing,
	polygonBounds,
	readPolygon,
	ringEdges,
	roundPosition,
	segmentDistance,
	validatePolygonLimits,
} from '../../shared/geometry'
import { transformGeometryPayload } from '../../shared/payload'
import { createLocalProjection } from '../../shared/projection'

/**
 * Projects the polygon and prepares its containment and clearance checks.
 * @param polygon - Polygon with validated topology.
 * @param options - Units and clearance settings.
 * @returns Local grid bounds, projection and point predicate.
 */
function prepareGrid(polygon: Polygon, options: GridOptions) {
	const { west, east, south, north } = polygonBounds(polygon)
	const projection = createLocalProjection([(west + east) / 2, (south + north) / 2])
	const rings = polygon.coordinates.map((ring) => ring.map(projection.forward))
	const outer = rings[0]
	if (!isDefined(outer)) throw new Error('Polygon requires an outer ring')
	const edges = rings.flatMap(ringEdges)
	const vertices = rings.flatMap((ring) => ring.slice(0, -1))
	const {
		west: minX,
		east: maxX,
		south: minY,
		north: maxY,
	} = polygonBounds({ type: 'Polygon', coordinates: rings })
	const width = maxX - minX,
		height = maxY - minY
	const unitScale = options.units === 'meters' ? 0.001 : 1
	const boundaryDistance = options.minimumBoundaryDistance * unitScale
	const vertexDistance = options.minimumVertexDistance * unitScale
	const holes = rings.slice(1)
	/**
	 * Checks containment and both clearance rules in projected kilometres.
	 * @param point - Projected query point.
	 * @returns Whether the point is allowed in the output grid.
	 */
	const isAllowed = (point: Position): boolean => {
		if (!insideRing(point, outer) || holes.some((hole) => insideRing(point, hole))) return false
		if (
			edges.some(
				([start, end]) =>
					segmentDistance(point, start, end) <= Math.max(1e-8, boundaryDistance),
			)
		)
			return false
		return !vertices.some(
			(vertex) => Math.hypot(point[0] - vertex[0], point[1] - vertex[1]) < vertexDistance,
		)
	}

	return { minX, minY, width, height, unitScale, projection, isAllowed }
}

/**
 * Generates unique, rounded points for one spacing, within the candidate budget.
 * @param grid - Projected polygon and clearance checks.
 * @param spacing - Grid spacing in kilometres.
 * @param options - Candidate limit and output precision.
 * @returns Points, or undefined when the candidate budget would be exceeded.
 */
function generateGridPoints(
	grid: ReturnType<typeof prepareGrid>,
	spacing: number,
	options: GridOptions,
): Position[] | undefined {
	const columns = Math.max(0, Math.ceil(grid.width / spacing - 0.5))
	const rows = Math.max(0, Math.ceil(grid.height / spacing - 0.5))
	const candidateCount = columns * rows
	if (!Number.isSafeInteger(candidateCount) || candidateCount > options.maxCandidates)
		return undefined

	const points = new Map<string, Position>()
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const point: Position = [
				grid.minX + (column + 0.5) * spacing,
				grid.minY + (row + 0.5) * spacing,
			]
			if (!grid.isAllowed(point)) continue
			const rounded = roundPosition(
				grid.projection.inverse(point),
				options.coordinatePrecision,
			)
			// Rounding must also preserve containment and clearance in the saved coordinates.
			if (!grid.isAllowed(grid.projection.forward(rounded))) continue
			points.set(rounded.join(','), rounded)
		}
	}
	return [...points.values()]
}

/**
 * Applies the configured policy to an empty grid.
 * @param points - Generated grid coordinates.
 * @param policy - Empty-result policy.
 * @returns GeoJSON MultiPoint or null.
 */
function gridResult(points: Position[], policy: GridOptions['emptyResult']) {
	if (points.length > 0 || policy === 'empty-multipoint')
		return { type: 'MultiPoint', coordinates: points }
	if (policy === 'error') throw new Error('Polygon grid contains no points')
	return null
}

/**
 * Adjusts regular grid spacing to fit the requested point-count range.
 * @param polygon - Polygon with validated topology.
 * @param options - Spacing, count bounds, clearance and precision settings.
 * @returns GeoJSON MultiPoint, or the configured empty result.
 */
export function calculateGrid(polygon: Polygon, options: GridOptions) {
	const grid = prepareGrid(polygon, options)
	const longestSide = Math.max(grid.width, grid.height)
	let spacing = options.spacing * grid.unitScale
	if (!isFiniteNumber(spacing) || spacing <= 0)
		throw new Error('Spacing cannot be represented in kilometres')
	let denseSpacing: number | undefined
	let sparseSpacing: number | undefined

	for (let iteration = 0; iteration < 32; iteration++) {
		const points = generateGridPoints(grid, spacing, options)

		if (
			isDefined(points) &&
			points.length >= options.minPoints &&
			points.length <= options.maxPoints
		)
			return gridResult(points, options.emptyResult)

		if (!isDefined(points) || points.length > options.maxPoints) {
			denseSpacing = spacing
			spacing = !isDefined(sparseSpacing)
				? Math.max(spacing * 2, longestSide / Math.sqrt(options.maxCandidates))
				: (spacing + sparseSpacing) / 2
		} else {
			sparseSpacing = spacing
			spacing = !isDefined(denseSpacing)
				? Math.min(spacing / 2, longestSide / Math.sqrt(Math.max(1, options.minPoints)))
				: (denseSpacing + spacing) / 2
		}
		if (!isFiniteNumber(spacing) || spacing <= 0) break
	}
	throw new Error(
		'Cannot satisfy minPoints/maxPoints within maxCandidates and the configured clearance/precision',
	)
}

/**
 * Extends an item or array with a polygon grid MultiPoint.
 * @param payload - Resolved Flow payload.
 * @param options - Validated operation options.
 * @returns Complete transformed payload.
 */
export function transformPayload(payload: unknown, options: GridOptions) {
	return transformGeometryPayload(payload, options, (source) => {
		const polygon = readPolygon(source)
		validatePolygonLimits(polygon, options)
		return calculateGrid(polygon, options)
	})
}
