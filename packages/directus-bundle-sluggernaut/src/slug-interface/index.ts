import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';
import { locales } from './constants';

export default defineInterface({
	id: 'oslug_interface',
	name: 'Slug',
	icon: 'link',
	description: 'Slugify a another field',
	component: InterfaceComponent,
	options: [
		{
			field: 'fields',
			name: 'Fields',
			type: 'json',
			meta: {
				width: 'full',
				special: [
					"cast-json"
				],
				interface: "select-multiple-dropdown",
				options: {
					choices: [
						{
							"text": "title",
							"value": "title"
						},
					],
					allowOther: true
				},
				note: 'Add fieldkeys of string values to slugify. If multiple keys are provided, they will be joined with a dash'
			},
			schema: { default_value: JSON.stringify(['title']) }
		},
		{
			field: 'locale',
			name: 'Locale',
			type: 'string',
			meta: {
				width: 'half',
				interface: "select-dropdown",
				options: {
					choices: locales.map((locale) => ({
						text: locale.label,
						value: locale.value
					})),
					allowOther: false
				},
				note: 'The locale determines the character set used for the slug'
			},
			schema: { default_value: 'en' }
		},
		{
			field: 'on_create',
			name: 'On create only',
			type: 'boolean',
			meta: {
				width: 'half',
				interface: 'checkbox',
				note: 'If enabled, the slug will be made generated only once',
			},
			schema: { default_value: false }
		},
		{
			field: 'make_unique',
			name: 'Make unique',
			type: 'boolean',
			meta: {
				width: 'half',
				interface: 'checkbox',
				note: 'If enabled, the slug will be made unique by appending a random string to it',
			},
			schema: { default_value: false }
		},
		{
			field: 'lowercase',
			name: 'Lowercase slug',
			type: 'boolean',
			meta: {
				width: 'half',
				interface: 'checkbox',
				note: 'If enabled, all character in the slug will be lowercased'
			},
			schema: { default_value: true }
		}
	],
	group: 'standard',
	types: ['string'],
	recommendedDisplays: ['oslug_display'],
});
