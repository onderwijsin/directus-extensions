import type { Position } from './geometry'

const radiusKm = 6371.0088
const radians = Math.PI / 180

/**
 * Creates a spherical Lambert azimuthal equal-area projection in kilometres.
 * @param center - WGS84 projection centre, chosen from the polygon bounding box.
 * @returns Forward and inverse coordinate conversions.
 */
export function createLocalProjection(center: Position) {
	const longitude0 = center[0] * radians
	const latitude0 = center[1] * radians
	const sin0 = Math.sin(latitude0)
	const cos0 = Math.cos(latitude0)
	return {
		/**
		 * Projects one WGS84 position into local kilometre coordinates.
		 * @param position - Longitude/latitude pair.
		 * @returns Local x/y pair.
		 */
		forward: (position: Position): Position => {
			const longitude = position[0] * radians - longitude0
			const latitude = position[1] * radians
			const sin = Math.sin(latitude)
			const cos = Math.cos(latitude)
			const denominator = 1 + sin0 * sin + cos0 * cos * Math.cos(longitude)
			if (denominator <= 1e-12)
				throw new Error('Polygon extends beyond the local projection domain')
			const scale = radiusKm * Math.sqrt(2 / denominator)
			return [
				scale * cos * Math.sin(longitude),
				scale * (cos0 * sin - sin0 * cos * Math.cos(longitude)),
			]
		},
		/**
		 * Converts local kilometre coordinates back to WGS84.
		 * @param position - Local x/y pair.
		 * @returns Longitude/latitude pair.
		 */
		inverse: (position: Position): Position => {
			const [x, y] = position
			const distance = Math.hypot(x, y)
			if (distance === 0) return [...center]
			if (distance > 2 * radiusKm)
				throw new Error('Point is outside the local projection domain')
			const angle = 2 * Math.asin(distance / (2 * radiusKm))
			const sin = Math.sin(angle)
			const cos = Math.cos(angle)
			const latitude = Math.asin(
				Math.max(-1, Math.min(1, cos * sin0 + (y * sin * cos0) / distance)),
			)
			const longitude =
				longitude0 + Math.atan2(x * sin, distance * cos0 * cos - y * sin0 * sin)
			const degrees = longitude / radians
			return [((((degrees + 180) % 360) + 360) % 360) - 180, latitude / radians]
		},
	}
}
