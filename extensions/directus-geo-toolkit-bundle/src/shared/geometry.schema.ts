import { z } from 'zod'

/** WGS84 positions always use longitude before latitude. */
export const positionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])

/** GeoJSON Point geometry with finite WGS84 longitude/latitude coordinates. */
export const geoJsonPointSchema = z.object({
	type: z.literal('Point'),
	coordinates: positionSchema,
})

/** Closed GeoJSON linear ring with at least three distinct vertices. */
const linearRingSchema = z
	.array(positionSchema)
	.min(4)
	.superRefine((ring, context) => {
		const first = ring[0]
		const last = ring.at(-1)
		if (!first || !last) return
		if (first[0] !== last[0] || first[1] !== last[1]) {
			context.addIssue({ code: 'custom', message: 'Polygon rings must be closed' })
		}
		if (new Set(ring.slice(0, -1).map((point) => point.join(','))).size < 3) {
			context.addIssue({
				code: 'custom',
				message: 'Polygon rings need three distinct vertices',
			})
		}
	})

/** Polygon geometry accepted by the polygon operations. */
export const geoJsonPolygonSchema = z.object({
	type: z.literal('Polygon'),
	coordinates: z.array(linearRingSchema).min(1),
})

/** Polygon geometry or a GeoJSON Feature carrying one. */
export const polygonSourceSchema = z.union([
	geoJsonPolygonSchema,
	z.object({ type: z.literal('Feature'), geometry: geoJsonPolygonSchema }),
])
