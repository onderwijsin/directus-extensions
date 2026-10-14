import type { z } from 'zod'
import type { geoJsonPolygonSchema, positionSchema } from './geometry.schema'

import { polygonSourceSchema } from './geometry.schema'

/** Longitude/latitude coordinates, or local x/y coordinates in kilometres. */
export type Position = z.infer<typeof positionSchema>
/** Validated Polygon geometry. */
export type Polygon = z.infer<typeof geoJsonPolygonSchema>

/**
 * Lists each edge of a closed polygon ring.
 * @param ring - Closed linear ring.
 * @returns Consecutive vertex pairs.
 */
export function ringEdges(ring: Position[]): [Position, Position][] {
	const edges: [Position, Position][] = []
	let previous = ring[0]
	if (!previous) return edges
	for (const point of ring.slice(1)) {
		edges.push([previous, point])
		previous = point
	}
	return edges
}

/**
 * Measures the planar distance from a point to a segment.
 * @param point - Query point.
 * @param start - Segment start.
 * @param end - Segment end.
 * @returns Distance in the input coordinate units.
 */
export function segmentDistance(point: Position, start: Position, end: Position): number {
	const dx = end[0] - start[0]
	const dy = end[1] - start[1]
	const lengthSquared = dx * dx + dy * dy
	const fraction =
		lengthSquared === 0
			? 0
			: Math.max(
					0,
					Math.min(
						1,
						((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared,
					),
				)
	return Math.hypot(point[0] - start[0] - fraction * dx, point[1] - start[1] - fraction * dy)
}

/**
 * Tests a point against a ring using ray casting; boundaries are handled separately.
 * @param point - Query point.
 * @param ring - Closed linear ring.
 * @returns Whether the point is inside the ring.
 */
export function insideRing(point: Position, ring: Position[]): boolean {
	let inside = false
	let start = ring.at(-1)
	if (!start) return false
	for (const end of ring) {
		if (
			start[1] > point[1] !== end[1] > point[1] &&
			point[0] <
				((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0]
		)
			inside = !inside
		start = end
	}
	return inside
}

/**
 * Computes the geographic bounding box without allocating flattened vertex arrays.
 * @param polygon - Validated polygon.
 * @returns Minimum and maximum longitude/latitude.
 */
export function polygonBounds(polygon: Polygon) {
	let west = Infinity,
		east = -Infinity,
		south = Infinity,
		north = -Infinity
	for (const ring of polygon.coordinates)
		for (const [longitude, latitude] of ring) {
			west = Math.min(west, longitude)
			east = Math.max(east, longitude)
			south = Math.min(south, latitude)
			north = Math.max(north, latitude)
		}
	return { west, east, south, north }
}

/**
 * Validates the source boundary before any polygon calculation.
 * @param source - Polygon geometry or Feature.
 * @returns Polygon geometry without the Feature wrapper.
 */
export function readPolygon(source: unknown): Polygon {
	const parsed = polygonSourceSchema.safeParse(source)
	if (!parsed.success)
		throw new Error('Expected a Polygon or Polygon Feature with closed WGS84 rings')
	return 'geometry' in parsed.data ? parsed.data.geometry : parsed.data
}

/**
 * Rounds a longitude/latitude pair for GeoJSON output.
 * @param point - WGS84 position.
 * @param precision - Decimal places.
 * @returns Rounded longitude/latitude pair.
 */
export function roundPosition(point: Position, precision: number): Position {
	return [Number(point[0].toFixed(precision)), Number(point[1].toFixed(precision))]
}

/**
 * Calculates a signed cross product for three planar positions.
 * @param a - Segment start.
 * @param b - Segment end.
 * @param c - Query point.
 * @returns Signed cross product.
 */
function cross(a: Position, b: Position, c: Position): number {
	return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/**
 * Detects crossing or touching segments, including collinear overlap.
 * @param first - First segment.
 * @param second - Second segment.
 * @returns Whether the segments intersect.
 */
function intersects(first: [Position, Position], second: [Position, Position]): boolean {
	const [a, b] = first
	const [c, d] = second
	if (
		Math.max(a[0], b[0]) < Math.min(c[0], d[0]) ||
		Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
		Math.max(a[1], b[1]) < Math.min(c[1], d[1]) ||
		Math.max(c[1], d[1]) < Math.min(a[1], b[1])
	)
		return false
	return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0
}

/**
 * Rejects degenerate, intersecting or improperly nested rings without repairing them.
 * @param polygon - Structurally validated polygon.
 * @returns Nothing; invalid topology throws.
 */
export function validatePolygonTopology(polygon: Polygon): void {
	const rings = polygon.coordinates
	const outer = rings[0]
	if (!outer) throw new Error('Polygon requires an outer ring')
	for (const [ringIndex, ring] of rings.entries()) {
		const edges = ringEdges(ring)
		let twiceArea = 0
		const origin = ring[0]
		if (!origin) throw new Error('Polygon requires ring vertices')
		for (const [edgeIndex, edge] of edges.entries()) {
			const [a, b] = edge
			if (a[0] === b[0] && a[1] === b[1]) throw new Error('Polygon has a zero-length edge')
			twiceArea += cross(origin, a, b)
			for (const [otherIndex, other] of edges.entries()) {
				if (
					otherIndex <= edgeIndex + 1 ||
					(edgeIndex === 0 && otherIndex === edges.length - 1)
				)
					continue
				if (intersects(edge, other)) throw new Error('Polygon ring intersects itself')
			}
		}
		if (Math.abs(twiceArea) < Number.EPSILON) throw new Error('Polygon ring has zero area')
		const first = ring[0]
		if (ringIndex > 0 && first && !insideRing(first, outer))
			throw new Error('Polygon hole must be inside the outer ring')
		for (const other of rings.slice(0, ringIndex)) {
			for (const edge of edges)
				for (const otherEdge of ringEdges(other)) {
					if (intersects(edge, otherEdge))
						throw new Error('Polygon rings must not touch or intersect')
				}
			if (
				other !== outer &&
				first &&
				(insideRing(first, other) || (other[0] && insideRing(other[0], ring)))
			) {
				throw new Error('Polygon holes must not overlap or contain each other')
			}
		}
	}
}

/**
 * Applies the reference implementation's vertex and bounding-box area limits.
 * @param polygon - Validated polygon.
 * @param options - Vertex and area bounds.
 * @returns Geographic bounds and approximate bounding-box area.
 */
export function validatePolygonLimits(
	polygon: Polygon,
	options: { maxVertices: number; maxAreaKm2: number },
) {
	const vertices = polygon.coordinates.reduce((count, ring) => count + ring.length - 1, 0)
	if (vertices > options.maxVertices) throw new Error('Polygon exceeds maxVertices')
	const bounds = polygonBounds(polygon)
	const { west, east, south, north } = bounds
	if (east - west > 180) throw new Error('Antimeridian-crossing polygons are not supported')
	const centerLatitude = (south + north) / 2
	const areaKm2 =
		(east - west) * (north - south) * 111 ** 2 * Math.cos((centerLatitude * Math.PI) / 180)
	if (areaKm2 > options.maxAreaKm2) throw new Error('Polygon bounding box exceeds maxAreaKm2')
	validatePolygonTopology(polygon)
	return { ...bounds, centerLatitude, areaKm2 }
}
