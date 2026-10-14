import type { AddressValue, ComponentName, InterfaceOptions, MapboxFeature } from './types'

import {
	hasKey,
	isRecord,
	isNonBlankString,
	isFiniteNumber,
} from '@onderwijsin/directus-extension-utils'

import { mapboxAddressValueSchema } from './address.schema'

const defaultSources: Record<ComponentName, string[]> = {
	address: ['properties.context.address.name'],
	street: ['properties.context.address.street_name', 'properties.context.street.name'],
	houseNumber: ['properties.context.address.address_number'],
	city: ['properties.context.place.name'],
	postcode: ['properties.context.postcode.name'],
	municipality: [],
	district: ['properties.context.district.name'],
	region: ['properties.context.region.name'],
	country: ['properties.context.country.name'],
	countryCode: ['properties.context.country.country_code'],
}

/** Reads a safe own-property path without coercing upstream objects into strings.
 * @param value - Validated provider feature.
 * @param path - Configured dotted property path.
 * @returns A nonempty text component, or null.
 */
export function readComponent(value: unknown, path: string): string | null {
	let current = value
	for (const segment of path.split('.')) {
		if (!isRecord(current) || !hasKey(current, segment)) return null
		current = current[segment]
	}
	if (isNonBlankString(current)) return current.trim()
	return isFiniteNumber(current) ? String(current) : null
}

/** Normalizes a selected v6 feature without retaining token, raw data, or upstream extras.
 * @param feature - Validated Mapbox feature.
 * @param options - Configuration used for this response (including storage provenance).
 * @returns A validated version-one address value.
 */
export function normalizeFeature(feature: MapboxFeature, options: InterfaceOptions): AddressValue {
	/** Reads the first available configured source for one address component.
	 * @param key - Normalized component name.
	 * @returns The first nonempty component or null.
	 */
	function read(key: ComponentName): string | null {
		const paths = options.componentSources[key] ?? defaultSources[key]
		return paths.map((path) => readComponent(feature, path)).find(isNonBlankString) ?? null
	}
	const street = read('street')
	const houseNumber = read('houseNumber')
	const streetAddress = [street, houseNumber].filter(isNonBlankString).join(' ')
	const fallbackAddress =
		options.componentSources.address?.length !== 0 && isNonBlankString(streetAddress)
			? streetAddress
			: null

	const fullAddress = readComponent(feature.properties, 'full_address')
	const preferredName = readComponent(feature.properties, 'name_preferred')
	const formattedAddress =
		fullAddress ??
		[preferredName ?? feature.properties.name, feature.properties.place_formatted]
			.filter(isNonBlankString)
			.join(', ')
	return mapboxAddressValueSchema.parse({
		schemaVersion: 1,
		provider: 'mapbox',
		providerApi: 'geocoding-v6',
		mapboxId: feature.properties.mapbox_id,
		featureType: feature.properties.feature_type,
		formattedAddress,
		geometry: feature.geometry,
		components: {
			address: read('address') ?? fallbackAddress,
			street,
			houseNumber,
			city: read('city'),
			postcode: read('postcode'),
			municipality: read('municipality'),
			district: read('district'),
			region: read('region'),
			country: read('country'),
			countryCode: read('countryCode')?.toUpperCase() ?? null,
		},
		language: options.language,
		storageMode: options.permanent ? 'permanent' : 'temporary',
	})
}
