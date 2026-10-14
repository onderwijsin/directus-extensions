import type { Polygon } from '../../shared/geometry'
import type { CentroidOptions } from './types'

import { isDefined } from '@onderwijsin/directus-extension-utils'

import {
	readPolygon,
	roundPosition,
	validatePolygonLimits,
	ringEdges,
	polygonBounds,
} from '../../shared/geometry'
import { transformGeometryPayload } from '../../shared/payload'
import { createLocalProjection } from '../../shared/projection'

/**
 * Averages outer-ring vertices as unit-sphere vectors, excluding the closing duplicate.
 * @param polygon - Polygon without holes.
 * @param precision - Decimal places for the returned coordinates.
 * @returns GeoJSON Point; this is a vertex centroid rather than an area centroid.
 */
export function calculateCentroid(polygon: Polygon, precision: number) {
	if (polygon.coordinates.length !== 1)
		throw new Error('Spherical vertex centroid does not support polygon holes')
	const outer = polygon.coordinates[0]
	if (!isDefined(outer)) throw new Error('Polygon requires an outer ring')
	let x = 0,
		y = 0,
		z = 0
	for (const [longitude, latitude] of outer.slice(0, -1)) {
		const lon = (longitude * Math.PI) / 180
		const lat = (latitude * Math.PI) / 180
		x += Math.cos(lat) * Math.cos(lon)
		y += Math.cos(lat) * Math.sin(lon)
		z += Math.sin(lat)
	}
	if (Math.hypot(x, y, z) / (outer.length - 1) < 1e-12)
		throw new Error('Polygon has no defined spherical vertex centroid')
	return {
		type: 'Point',
		coordinates: roundPosition(
			[(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI],
			precision,
		),
	}
}

/**
 * Computes an area-weighted centroid in the local equal-area projection, subtracting holes.
 * @param polygon - Polygon with validated topology.
 * @param precision - Decimal places for output coordinates.
 * @returns GeoJSON Point; the centroid may lie outside a concave polygon or inside a hole.
 */
export function calculateAreaCentroid(polygon: Polygon, precision: number) {
	const { west, east, south, north } = polygonBounds(polygon)
	const projection = createLocalProjection([(west + east) / 2, (south + north) / 2])
	let totalArea = 0,
		weightedX = 0,
		weightedY = 0
	for (const [index, ring] of polygon.coordinates.entries()) {
		let twiceArea = 0,
			x = 0,
			y = 0
		for (const [start, end] of ringEdges(ring.map(projection.forward))) {
			const cross = start[0] * end[1] - end[0] * start[1]
			twiceArea += cross
			x += (start[0] + end[0]) * cross
			y += (start[1] + end[1]) * cross
		}
		if (Math.abs(twiceArea) < Number.EPSILON)
			throw new Error('Projected polygon ring has zero area')
		const weight = (Math.abs(twiceArea) / 2) * (index === 0 ? 1 : -1)
		totalArea += weight
		weightedX += (x / (3 * twiceArea)) * weight
		weightedY += (y / (3 * twiceArea)) * weight
	}
	if (totalArea <= Number.EPSILON)
		throw new Error('Polygon has no positive area after subtracting holes')
	return {
		type: 'Point',
		coordinates: roundPosition(
			projection.inverse([weightedX / totalArea, weightedY / totalArea]),
			precision,
		),
	}
}

/**
 * Extends an incoming item or array with a centroid Point.
 * @param payload - Resolved Flow payload.
 * @param options - Validated operation options.
 * @returns Complete transformed payload.
 */
export function transformPayload(payload: unknown, options: CentroidOptions) {
	return transformGeometryPayload(payload, options, (source) => {
		const polygon = readPolygon(source)
		validatePolygonLimits(polygon, options)
		return options.method === 'spherical-vertex'
			? calculateCentroid(polygon, options.coordinatePrecision)
			: calculateAreaCentroid(polygon, options.coordinatePrecision)
	})
}
