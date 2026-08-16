/**
 * Makes object properties optional recursively while preserving functions and primitive values.
 * Arrays are transformed element-by-element.
 */
export type PartialNested<T> = T extends (...args: never[]) => unknown
	? T
	: T extends new (...args: never[]) => unknown
		? T
		: T extends (infer U)[]
			? PartialNested<U>[]
			: T extends object
				? { [K in keyof T]?: PartialNested<T[K]> }
				: T

/** A GeoJSON position represented as longitude/latitude coordinates. */
export type LngLatCoordinates = [longitude: number, latitude: number]

/** A GeoJSON geometry value. */
export type Geometry =
	| { type: 'Point'; coordinates: LngLatCoordinates }
	| { type: 'LineString'; coordinates: LngLatCoordinates[] }
	| { type: 'Polygon'; coordinates: LngLatCoordinates[][] }
	| { type: 'MultiPoint'; coordinates: LngLatCoordinates[] }
	| { type: 'MultiLineString'; coordinates: LngLatCoordinates[][] }
	| { type: 'MultiPolygon'; coordinates: LngLatCoordinates[][][] }
