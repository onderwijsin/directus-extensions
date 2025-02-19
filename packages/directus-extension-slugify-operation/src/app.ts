import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'slugify',
	name: 'Slugify',
	icon: 'box',
	description: 'This operation will slugify input strings.',
	overview: ({ fields, output_key, make_unique, lowercase }) => [
		{
			label: 'Fields',
			text: fields.join(', '),
		},
		{
			label: 'Output key',
			text: output_key,
		},
		{
			label: 'Make unique',
			text: make_unique ? 'Yes' : 'No',
		},
		{
			label: 'Lowercase',
			text: lowercase ? 'Yes' : 'No',
		},
	],
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
		},
		{
			field: 'output_key',
			name: 'Output field key',
			type: 'string',
			meta: {
				interface: 'input',
				note: 'The field key where the slug will be stored',
				required: true
			}
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
		}
	],
});
