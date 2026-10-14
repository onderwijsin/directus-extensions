import { z } from 'zod'

/** WGS84 positions always use longitude before latitude. */
export const positionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])

/** GeoJSON Point geometry with finite WGS84 longitude/latitude coordinates. */
export const geoJsonPointSchema = z.object({
	type: z.literal('Point'),
	coordinates: positionSchema,
})
