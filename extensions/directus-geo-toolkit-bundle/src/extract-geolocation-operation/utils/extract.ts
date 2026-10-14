import type { ExtractionOptions } from './types'

import { z } from 'zod'

import { mapboxAddressValueSchema } from '../../mapbox-address-interface/utils/address.schema'
import { googleAddressSchema } from '../../shared/google-address.schema'

const sourceSchema = z.union([mapboxAddressValueSchema, googleAddressSchema])

/**
 * Reads either supported persisted address shape into common extraction values.
 * @param source - Validated persisted address.
 * @returns Components and Point geometry.
 */
function readAddress(source: z.infer<typeof sourceSchema>) {
	if ('components' in source)
		return {
			...source.components,
			formattedAddress: source.formattedAddress,
			point: source.geometry,
		}
	const { properties, geometry } = source
	/**
	 * Finds the provider component with the requested Google type.
	 * @param type - Google address component type.
	 * @returns Matching raw component, when present.
	 */
	const component = (type: string) => properties.raw.find((entry) => entry.types.includes(type))
	const street = component('route')?.longText ?? null
	const houseNumber = component('street_number')?.longText ?? null
	return {
		formattedAddress: properties.formated,
		address: [street, houseNumber].filter(Boolean).join(' ') || null,
		street,
		houseNumber,
		city: component('locality')?.longText ?? null,
		postcode: properties.postalCode ?? component('postal_code')?.longText ?? null,
		municipality: null,
		district: component('administrative_area_level_2')?.longText ?? null,
		region:
			properties.administrativeArea ??
			component('administrative_area_level_1')?.longText ??
			null,
		country: component('country')?.longText ?? null,
		countryCode: properties.country ?? component('country')?.shortText ?? null,
		point: geometry,
	}
}

/**
 * Validates a saved address and prepares the values exposed by the operation.
 * @param source - Non-null saved address.
 * @param options - Coordinate precision and country-code settings.
 * @param index - Item index used in validation errors.
 * @returns Address components, numeric coordinates and GeoJSON Point.
 */
export function extractValues(source: unknown, options: ExtractionOptions, index: number) {
	const parsed = sourceSchema.safeParse(source)
	if (!parsed.success)
		throw new Error(
			`Item ${index}: invalid address; expected Geo Toolkit version 1 or Google address Feature`,
		)
	const address = readAddress(parsed.data)
	const longitude = Number(address.point.coordinates[0].toFixed(options.coordinatePrecision))
	const latitude = Number(address.point.coordinates[1].toFixed(options.coordinatePrecision))
	let countryCode = address.countryCode
	if (options.countryCodeCase === 'upper') countryCode = countryCode?.toUpperCase() ?? null
	if (options.countryCodeCase === 'lower') countryCode = countryCode?.toLowerCase() ?? null
	return {
		...address,
		countryCode,
		longitude,
		latitude,
		point: { ...address.point, coordinates: [longitude, latitude] },
	}
}
