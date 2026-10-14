import { defineOperationApp } from '@directus/extensions-sdk'

import { defaultOutputs } from './utils/options.schema'

/** Registers the configurable address payload transform. */
export default defineOperationApp({
	id: 'geo-extract-geolocation-operation',
	name: 'Extract Geolocation Data',
	icon: 'location_on',
	description: 'Extend an item payload with address components and coordinates.',
	/**
	 * Shows the configured source and overwrite policy on the Flow tile.
	 * @param options - Stored operation options.
	 * @param options.inputField - Source field key.
	 * @param options.overwrite - Destination overwrite policy.
	 * @returns Operation overview labels.
	 */
	overview: ({ inputField, overwrite }: { inputField?: string; overwrite?: string }) => [
		{ label: 'Source field', text: inputField ?? 'address_data' },
		{ label: 'Overwrite', text: overwrite ?? 'replace' },
	],
	options: [
		{
			field: 'payload',
			name: 'Payload',
			type: 'json',
			schema: { default_value: '{{ $trigger.payload }}' },
			meta: {
				interface: 'input-code',
				options: { language: 'json' },
				width: 'full',
				note: 'Bind an item object or array from the trigger or a previous operation. Every item in an array is processed.',
			},
		},
		{
			field: 'inputField',
			name: 'Source field',
			type: 'string',
			schema: { default_value: 'address_data' },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'The payload property containing the source address data.',
			},
		},
		{
			field: 'outputs',
			name: 'Output fields',
			type: 'json',
			schema: { default_value: defaultOutputs },
			meta: {
				interface: 'input-code',
				options: { language: 'json' },
				width: 'full',
				note: 'Map components to existing collection field keys. In this object, omit a component or use null, false, 0 or an empty string to disable it.',
			},
		},
		{
			field: 'overwrite',
			name: 'Overwrite',
			type: 'string',
			schema: { default_value: 'replace' },
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'replace', value: 'replace' },
						{ text: 'fill-empty', value: 'fill-empty' },
						{ text: 'preserve-input', value: 'preserve-input' },
					],
				},
				width: 'full',
				note: 'Determines how existing values in the destination fields are handled.',
			},
		},
		{
			field: 'missingInput',
			name: 'Missing source',
			type: 'string',
			schema: { default_value: 'skip' },
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'skip', value: 'skip' },
						{ text: 'error', value: 'error' },
					],
				},
				width: 'full',
				note: 'Applies when the entire source field is absent or undefined, as in a partial update. Skip returns that item unchanged; error rejects the operation.',
			},
		},
		{
			field: 'nullInput',
			name: 'Null source',
			type: 'string',
			schema: { default_value: 'clear' },
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'clear', value: 'clear' },
						{ text: 'skip', value: 'skip' },
						{ text: 'error', value: 'error' },
					],
				},
				width: 'full',
				note: 'Applies when the entire source field is null. Clear sets enabled outputs to null, subject to Overwrite; skip leaves the item unchanged; error rejects the operation.',
			},
		},
		{
			field: 'missingComponent',
			name: 'Missing component',
			type: 'string',
			schema: { default_value: 'null' },
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'null', value: 'null' },
						{ text: 'skip', value: 'skip' },
						{ text: 'error', value: 'error' },
					],
				},
				width: 'full',
				note: 'Applies when a valid source address lacks an enabled component. Null writes null; skip leaves that destination unchanged; error rejects the operation. Applied before Overwrite.',
			},
		},
		{
			field: 'countryCodeCase',
			name: 'Country code case',
			type: 'string',
			schema: { default_value: 'upper' },
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'upper', value: 'upper' },
						{ text: 'lower', value: 'lower' },
						{ text: 'preserve', value: 'preserve' },
					],
				},
				width: 'full',
			},
		},
		{
			field: 'coordinatePrecision',
			name: 'Coordinate precision',
			type: 'integer',
			schema: { default_value: 8 },
			meta: { interface: 'input', width: 'full', note: 'Decimal places, from 0 to 15.' },
		},
	],
})
