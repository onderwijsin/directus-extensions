import { effectScope, ref } from 'vue'

import { describe, expect, it } from 'vitest'

import { useMapboxCredentials } from '../src/mapbox-address-interface/composables/useMapboxCredentials'
import { mapboxAddressValueSchema } from '../src/mapbox-address-interface/utils/address.schema'
import { countryChoices } from '../src/mapbox-address-interface/utils/choices'
import { normalizeFeature, readComponent } from '../src/mapbox-address-interface/utils/normalize'
import {
	interfaceOptionsSchema,
	worldviews,
} from '../src/mapbox-address-interface/utils/options.schema'
import {
	mapboxFeatureSchema,
	mapboxResponseSchema,
} from '../src/mapbox-address-interface/utils/response.schema'
import { feature, response } from './fixtures/address'

describe('address contract', () => {
	it('lists the United States and Netherlands first without duplicate country choices', () => {
		expect(countryChoices.slice(0, 2).map((choice) => choice.value)).toEqual(['US', 'NL'])
		expect(countryChoices).toHaveLength(249)
		expect(new Set(countryChoices.map((choice) => choice.value)).size).toBe(249)
	})
	it('keeps readable worldview names mapped to supported provider codes', () => {
		expect(worldviews.enum['United States']).toBe('us')
		for (const code of ['ar', 'cn', 'in', 'jp', 'ma', 'rs', 'ru', 'tr', 'us']) {
			expect(interfaceOptionsSchema.parse({ worldview: code }).worldview).toBe(code)
		}
		expect(interfaceOptionsSchema.safeParse({ worldview: 'United States' }).success).toBe(false)
		expect(interfaceOptionsSchema.safeParse({ worldview: 'nl' }).success).toBe(false)
	})
	it('defaults both theme styles and validates each style URL independently', () => {
		expect(interfaceOptionsSchema.parse({})).toMatchObject({
			lightStyleUrl: 'mapbox://styles/mapbox/light-v11',
			darkStyleUrl: 'mapbox://styles/mapbox/dark-v11',
		})
		for (const key of ['lightStyleUrl', 'darkStyleUrl']) {
			for (const url of [
				'https://untrusted.example/style.json',
				'mapbox://styles/mapbox/light-v11?access_token=secret',
				'http://api.mapbox.com/styles/v1/mapbox/dark-v11',
			]) {
				expect(interfaceOptionsSchema.safeParse({ [key]: url }).success).toBe(false)
			}
			expect(
				interfaceOptionsSchema.safeParse({
					[key]: 'https://api.mapbox.com/styles/v1/mapbox/light-v11',
				}).success,
			).toBe(true)
		}
	})

	it('strips provider extras and retains components, null municipality and truthful provenance', () => {
		const value = normalizeFeature(
			mapboxFeatureSchema.parse(feature),
			interfaceOptionsSchema.parse({ permanent: false }),
		)
		expect(value.storageMode).toBe('temporary')
		expect(value.components).toMatchObject({
			address: 'Example Street 10',
			postcode: '0012 AB',
			municipality: null,
			countryCode: 'NL',
		})
		expect(value.geometry.coordinates).toEqual([4.9, 52.3])
		expect(mapboxAddressValueSchema.safeParse({ ...value, raw: feature }).success).toBe(false)
		expect(JSON.stringify(value)).not.toContain('context')
	})
	it('honors configured fallback paths, disabling components and the street address fallback', () => {
		const value = normalizeFeature(
			mapboxFeatureSchema.parse(feature),
			interfaceOptionsSchema.parse({
				componentSources: {
					city: [],
					municipality: [
						'properties.context.missing.name',
						'properties.context.district.name',
					],
				},
			}),
		)
		expect(value.components.city).toBeNull()
		expect(value.components.municipality).toBe('Example District')
		expect(value.components.address).toBe('Example Street 10')
	})
	it('rejects unsupported versions, invalid coordinates and options without silently repairing values', () => {
		const value = normalizeFeature(
			mapboxFeatureSchema.parse(feature),
			interfaceOptionsSchema.parse({}),
		)
		expect(mapboxAddressValueSchema.safeParse({ ...value, schemaVersion: 2 }).success).toBe(
			false,
		)
		expect(
			mapboxResponseSchema.safeParse({
				...response,
				features: [{ ...feature, geometry: { type: 'Point', coordinates: [200, 52] } }],
			}).success,
		).toBe(false)
		for (const options of [
			{ resultLimit: 11 },
			{ styleUrl: 'https://untrusted.example/style.json' },
			{ componentSources: { city: ['__proto__.name'] } },
		])
			expect(interfaceOptionsSchema.safeParse(options).success).toBe(false)
		expect(readComponent({}, 'constructor.prototype')).toBeNull()
	})
	it('normalizes display fallbacks and honors an explicitly disabled address component', () => {
		const parsed = mapboxFeatureSchema.parse({
			...feature,
			properties: {
				...feature.properties,
				full_address: ' ',
				name_preferred: ' ',
				name: 'Example Street 10',
				place_formatted: 'Example City',
			},
		})
		const value = normalizeFeature(
			parsed,
			interfaceOptionsSchema.parse({ componentSources: { address: [] } }),
		)
		expect(value.components.address).toBeNull()
		expect(value.formattedAddress).toBe('Example Street 10, Example City')
		expect(readComponent({ houseNumber: 0 }, 'houseNumber')).toBe('0')
		expect(mapboxAddressValueSchema.safeParse({ ...value, featureType: 'poi' }).success).toBe(
			false,
		)
	})
	it('reactively resolves settings and overrides with interface-first precedence', () => {
		const scope = effectScope()
		const native = ref<unknown>(null)
		const options = ref(interfaceOptionsSchema.parse({}))
		const credentials = scope.run(() => useMapboxCredentials(options, native))
		if (!credentials) throw new Error('Missing credential state')
		expect(credentials.error.value).toContain('Set a public')
		native.value = 'pk.project'
		expect(credentials.token.value).toBe('pk.project')
		options.value = interfaceOptionsSchema.parse({ mapboxKey: 'pk.override' })
		expect(credentials.token.value).toBe('pk.override')
		options.value = interfaceOptionsSchema.parse({ mapboxKey: '  ' })
		expect(credentials.token.value).toBe('pk.project')
		options.value = interfaceOptionsSchema.parse({ mapboxKey: 'sk.invalid' })
		expect(credentials.error.value).toContain('browser-public')
		scope.stop()
	})
})
