import { describe, expect, it } from 'vitest'

import { extractionOptionsSchema } from '../src/extract-geolocation-operation/utils/options.schema'
import { transformPayload } from '../src/extract-geolocation-operation/utils/transform'
import { normalizeFeature } from '../src/mapbox-address-interface/utils/normalize'
import { interfaceOptionsSchema } from '../src/mapbox-address-interface/utils/options.schema'
import { mapboxFeatureSchema } from '../src/mapbox-address-interface/utils/response.schema'
import { feature } from './fixtures/address'

const address = normalizeFeature(
	mapboxFeatureSchema.parse(feature),
	interfaceOptionsSchema.parse({}),
)
const google = {
	type: 'Feature',
	geometry: { type: 'Point', coordinates: [4.566523399999999, 51.9332112] },
	properties: {
		country: 'NL',
		postalCode: '2906 VK',
		administrativeArea: 'Zuid-Holland',
		formated: 'Bongerd 4, 2906 VK Capelle aan den IJssel, Netherlands',
		displayName: '4',
		viewport: {},
		raw: [
			{ longText: '4', shortText: '4', types: ['street_number'] },
			{ longText: 'Bongerd', shortText: 'Bongerd', types: ['route'] },
			{
				longText: 'Capelle aan den IJssel',
				shortText: 'Capelle aan den IJssel',
				types: ['locality', 'political'],
			},
			{
				longText: 'Capelle aan Den IJssel',
				shortText: 'Capelle aan Den IJssel',
				types: ['administrative_area_level_2', 'political'],
			},
			{
				longText: 'Zuid-Holland',
				shortText: 'ZH',
				types: ['administrative_area_level_1', 'political'],
			},
			{ longText: 'Netherlands', shortText: 'NL', types: ['country', 'political'] },
			{ longText: '2906 VK', shortText: '2906 VK', types: ['postal_code'] },
		],
	},
}

/**
 * Runs extraction with validated options, as at the API boundary.
 * @param payload - Input item or batch.
 * @param options - Configuration overrides.
 * @returns Complete transformed payload.
 */
function transform(payload: unknown, options: Record<string, unknown> = {}) {
	return transformPayload(payload, extractionOptionsSchema.parse(options))
}

describe('Extract Geolocation Data', () => {
	it('extends the interface payload without mutating it or changing the source', () => {
		const payload = { title: 'Office', address_data: address }
		const original = structuredClone(payload)
		expect(transform(payload)).toMatchObject({
			...payload,
			formatted_address: address.formattedAddress,
			street: address.components.street,
			postal_code: '0012 AB',
			municipality: null,
			longitude: 4.9,
			latitude: 52.3,
			location_geopoint: address.geometry,
		})
		expect(payload).toEqual(original)
	})
	it('extracts the Google Feature shape, retaining textual numbers and coordinate order', () => {
		expect(transform({ address_data: google })).toMatchObject({
			address_data: google,
			address: 'Bongerd 4',
			street: 'Bongerd',
			house_number: '4',
			city: 'Capelle aan den IJssel',
			postal_code: '2906 VK',
			municipality: null,
			district: 'Capelle aan Den IJssel',
			region: 'Zuid-Holland',
			country: 'Netherlands',
			country_code: 'NL',
			longitude: 4.5665234,
			latitude: 51.9332112,
			location_geopoint: { type: 'Point', coordinates: [4.5665234, 51.9332112] },
		})
	})
	it('honors all overwrite policies, including explicitly supplied empty values', () => {
		const payload = {
			address_data: address,
			street: '',
			city: null,
			postal_code: false,
			longitude: 0,
		}
		expect(transform(payload, { overwrite: 'preserve-input' })).toMatchObject(payload)
		expect(transform(payload, { overwrite: 'fill-empty' })).toMatchObject({
			street: address.components.street,
			city: address.components.city,
			postal_code: false,
			longitude: 0,
		})
		expect(transform(payload)).toMatchObject({
			longitude: 4.9,
			street: address.components.street,
		})
	})
	it('supports renamed sources, disabled destinations, case and precision', () => {
		const result = transform(
			{ source: google },
			{
				inputField: 'source',
				outputs: {
					street: 'road',
					city: null,
					point: 'geopoint',
					countryCode: 'country_code',
					longitude: 'longitude',
				},
				countryCodeCase: 'lower',
				coordinatePrecision: 3,
			},
		)
		expect(result).toMatchObject({
			road: 'Bongerd',
			country_code: 'nl',
			longitude: 4.567,
			geopoint: { type: 'Point', coordinates: [4.567, 51.933] },
		})
		expect(result).not.toHaveProperty('city')
		expect(result).not.toHaveProperty('street')
		expect(result).not.toHaveProperty('location_geopoint')
	})
	it('distinguishes missing, null and invalid sources on partial updates', () => {
		expect(transform({ title: 'Only title' })).toEqual({ title: 'Only title' })
		expect(() => transform({}, { missingInput: 'error' })).toThrow('missing source')
		expect(transform({ address_data: null })).toMatchObject({
			address_data: null,
			street: null,
			location_geopoint: null,
		})
		expect(
			transform({ address_data: null, street: 'Manual' }, { overwrite: 'preserve-input' }),
		).toMatchObject({ street: 'Manual' })
		expect(transform({ address_data: null }, { nullInput: 'skip' })).toEqual({
			address_data: null,
		})
		expect(() => transform({ address_data: null }, { nullInput: 'error' })).toThrow(
			'null source',
		)
		for (const invalid of [
			{},
			{ ...address, schemaVersion: 2 },
			{ ...google, geometry: { type: 'Point', coordinates: [200, 52] } },
		]) {
			expect(() => transform({ address_data: invalid })).toThrow('invalid address')
		}
	})
	it('applies missing component policy and validates the complete batch without mutations', () => {
		expect(
			transform({ address_data: address }, { missingComponent: 'skip' }),
		).not.toHaveProperty('municipality')
		expect(() => transform({ address_data: address }, { missingComponent: 'error' })).toThrow(
			'missing component municipality',
		)
		const batch = [{ address_data: address }, { address_data: {} }]
		const original = structuredClone(batch)
		expect(() => transform(batch)).toThrow('Item 1: invalid address')
		expect(batch).toEqual(original)
		expect(transform([{ title: 'A' }, { title: 'B' }])).toEqual([
			{ title: 'A' },
			{ title: 'B' },
		])
		const largerBatch = Array.from({ length: 101 }, (_, index) => ({ title: `Item ${index}` }))
		expect(transform(largerBatch)).toEqual(largerBatch)
		expect(() => transform(null)).toThrow('object payload')
	})
	it('disables omitted and falsy mappings without disabling the default output set', () => {
		expect(transform({ address_data: address })).toHaveProperty('street')
		for (const disabled of [null, false, 0, '']) {
			expect(
				transform(
					{ address_data: address, title: 'Office' },
					{ outputs: { street: disabled } },
				),
			).toEqual({ address_data: address, title: 'Office' })
		}
		expect(transform({ address_data: address }, { outputs: {} })).toEqual({
			address_data: address,
		})
		expect(
			transform({ address_data: address }, { outputs: { street: 'custom_field' } }),
		).toEqual({ address_data: address, custom_field: address.components.street })
	})
	it('fills only empty destinations and preserves populated strings, zero and false', () => {
		for (const street of ['Manual street', ' ', 0, false]) {
			expect(
				transform(
					{ address_data: address, street },
					{ outputs: { street: 'street' }, overwrite: 'fill-empty' },
				),
			).toEqual({ address_data: address, street })
		}
		for (const street of [null, undefined, '']) {
			expect(
				transform(
					{ address_data: address, street },
					{ outputs: { street: 'street' }, overwrite: 'fill-empty' },
				),
			).toHaveProperty('street', address.components.street)
		}
	})
	it('rejects unsafe, duplicate, nested or colliding field mappings and invalid options', () => {
		for (const options of [
			{ outputs: { street: 'city', city: 'city' } },
			{ outputs: { street: 'address_data' } },
			{ outputs: { street: '__proto__' } },
			{ outputs: { street: 'nested.key' } },
			{ outputs: { unknown: 'field' } },
			{ coordinatePrecision: 16 },
		])
			expect(extractionOptionsSchema.safeParse(options).success).toBe(false)
	})
})
