import { defineInterface } from '@directus/extensions-sdk'

import InterfaceComponent from './interface.vue'
import { countryChoices, languageChoices } from './utils/choices'
import { featureTypeSchema, interfaceDefaults, worldviews } from './utils/options.schema'

/** Registers the Mapbox address JSON input and its validated configuration defaults. */
export default defineInterface({
	id: 'geo-mapbox-address-interface',
	name: 'Mapbox Address',
	icon: 'location_on',
	description: 'Search for an address and show its location on a Mapbox map.',
	component: InterfaceComponent,
	types: ['json'],
	group: 'standard',
	options: [
		{
			field: 'mapboxKey',
			name: 'Public Mapbox key',
			type: 'string',
			schema: { default_value: interfaceDefaults.mapboxKey },
			meta: {
				interface: 'input',
				width: 'full',
				options: { masked: true },
				note: 'Overrides the global Directus mapbox_key. Leave empty to use the project settings key.',
			},
		},
		{
			field: 'permanent',
			name: 'Permanent geocoding',
			type: 'boolean',
			schema: { default_value: interfaceDefaults.permanent },
			meta: {
				interface: 'boolean',
				width: 'full',
				options: {},
				note: 'Temporary results may not be retained, including in development.',
			},
		},
		{
			field: 'language',
			name: 'Language',
			type: 'string',
			schema: { default_value: interfaceDefaults.language },
			meta: {
				interface: 'select-dropdown',
				width: 'full',
				options: { choices: languageChoices },
			},
		},
		{
			field: 'countries',
			name: 'Country restrictions',
			type: 'json',
			schema: { default_value: interfaceDefaults.countries },
			meta: {
				interface: 'select-multiple-dropdown',
				width: 'full',
				options: { choices: countryChoices },
				note: 'Only return results within the selected countries. Leave empty to search worldwide.',
			},
		},
		{
			field: 'featureTypes',
			name: 'Result feature types',
			type: 'json',
			schema: { default_value: interfaceDefaults.featureTypes },
			meta: {
				interface: 'select-multiple-dropdown',
				width: 'full',
				options: {
					choices: featureTypeSchema.options.map((value) => ({ text: value, value })),
				},
				note: 'Search addresses, streets and towns by default. Address-only excludes towns such as Soest. Other result types may have fewer address components.',
			},
		},
		{
			field: 'autocomplete',
			name: 'Autocomplete',
			type: 'boolean',
			schema: { default_value: interfaceDefaults.autocomplete },
			meta: { interface: 'boolean', width: 'full', options: {} },
		},
		{
			field: 'minQueryLength',
			name: 'Minimum query length',
			type: 'integer',
			schema: { default_value: interfaceDefaults.minQueryLength },
			meta: { interface: 'input', width: 'full', options: {} },
		},
		{
			field: 'debounceMs',
			name: 'Debounce (ms)',
			type: 'integer',
			schema: { default_value: interfaceDefaults.debounceMs },
			meta: { interface: 'input', width: 'full', options: {} },
		},
		{
			field: 'resultLimit',
			name: 'Result limit',
			type: 'integer',
			schema: { default_value: interfaceDefaults.resultLimit },
			meta: { interface: 'input', width: 'full', options: {} },
		},
		{
			field: 'proximity',
			name: 'Search bias (coordinates or ip)',
			type: 'json',
			schema: { default_value: interfaceDefaults.proximity },
			meta: {
				interface: 'input-code',
				width: 'full',
				options: { language: 'json', template: '[4.9041, 52.3676]' },
				note: 'Prefer nearby results using [longitude, latitude], for example [4.9041, 52.3676] for Amsterdam, or enter "ip" for IP-based bias. This does not restrict the search area.',
			},
		},
		{
			field: 'worldview',
			name: 'Worldview',
			type: 'string',
			schema: { default_value: interfaceDefaults.worldview },
			meta: {
				interface: 'select-dropdown',
				width: 'full',
				options: {
					choices: Object.entries(worldviews.enum).map(([text, value]) => ({
						text,
						value,
					})),
				},
				note: 'Select whose view of disputed territories Mapbox uses for place and country names. The default is the US view; this is separate from the language setting.',
			},
		},
		{
			field: 'componentSources',
			name: 'Component source paths',
			type: 'json',
			schema: { default_value: interfaceDefaults.componentSources },
			meta: {
				interface: 'input-code',
				width: 'full',
				options: {
					language: 'json',
					template: JSON.stringify(
						{
							city: [
								'properties.context.place.name',
								'properties.context.locality.name',
							],
							postcode: ['properties.context.postcode.name'],
							country: ['properties.context.country.name'],
						},
						null,
						2,
					),
				},
				note: 'Override where address components are read from the Mapbox result. Each key contains fallback paths, e.g. {"city":["properties.context.place.name"]}. Leave empty to use defaults.',
			},
		},
		{
			field: 'lightStyleUrl',
			name: 'Light map style URL',
			type: 'string',
			schema: { default_value: interfaceDefaults.lightStyleUrl },
			meta: { interface: 'input', width: 'full', options: {} },
		},
		{
			field: 'darkStyleUrl',
			name: 'Dark map style URL',
			type: 'string',
			schema: { default_value: interfaceDefaults.darkStyleUrl },
			meta: { interface: 'input', width: 'full', options: {} },
		},
		{
			field: 'showMap',
			name: 'Show map',
			type: 'boolean',
			schema: { default_value: interfaceDefaults.showMap },
			meta: { interface: 'boolean', width: 'full', options: {} },
		},
		{
			field: 'mapHeightPx',
			name: 'Map height (px)',
			type: 'integer',
			schema: { default_value: interfaceDefaults.mapHeightPx },
			meta: { interface: 'input', width: 'full', options: {} },
		},
		{
			field: 'defaultCenter',
			name: 'Default map center [longitude, latitude]',
			type: 'json',
			schema: { default_value: interfaceDefaults.defaultCenter },
			meta: { interface: 'input-code', width: 'full', options: { language: 'json' } },
		},
		{
			field: 'defaultZoom',
			name: 'Default map zoom',
			type: 'float',
			schema: { default_value: interfaceDefaults.defaultZoom },
			meta: { interface: 'input', width: 'full', options: {} },
		},
		{
			field: 'selectedZoom',
			name: 'Selected address zoom',
			type: 'float',
			schema: { default_value: interfaceDefaults.selectedZoom },
			meta: { interface: 'input', width: 'full', options: {} },
		},
		{
			field: 'allowClear',
			name: 'Allow clearing',
			type: 'boolean',
			schema: { default_value: interfaceDefaults.allowClear },
			meta: { interface: 'boolean', width: 'full', options: {} },
		},
	],
})
