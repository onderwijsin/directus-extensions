import type { defineOperationApp } from '@directus/extensions-sdk'

/**
 * Provides the common polygon input, merge and validation options in the Flow editor.
 * @param outputField - Operation-specific default destination key.
 * @returns Directus operation option fields.
 */
export function polygonOperationOptions(outputField: string) {
	return [
		{
			field: 'payload',
			name: 'Payload',
			type: 'json',
			schema: { default_value: '{{ $trigger.payload }}' },
			meta: {
				interface: 'input-code',
				options: { language: 'json' },
				width: 'full',
				note: 'Bind an item object or array from the trigger or a previous operation. Every item is processed.',
			},
		},
		{
			field: 'inputField',
			name: 'Source field',
			type: 'string',
			schema: { default_value: 'polygon' },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Direct payload key containing a GeoJSON Polygon or Polygon Feature.',
			},
		},
		{
			field: 'outputField',
			name: 'Destination field',
			type: 'string',
			schema: { default_value: outputField },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Existing collection field to receive the derived geometry. The complete payload is returned; fields are not created.',
			},
		},
		{
			field: 'overwrite',
			name: 'Overwrite',
			type: 'string',
			schema: { default_value: 'replace' },
			meta: {
				interface: 'select-dropdown',
				width: 'full',
				options: {
					choices: [
						{ text: 'Replace', value: 'replace' },
						{ text: 'Fill empty', value: 'fill-empty' },
						{ text: 'Preserve input', value: 'preserve-input' },
					],
				},
				note: 'Replace writes the result; fill-empty only fills null/undefined/empty strings; preserve-input only adds absent fields. Policies apply to the incoming payload.',
			},
		},
		{
			field: 'missingInput',
			name: 'Missing source',
			type: 'string',
			schema: { default_value: 'skip' },
			meta: {
				interface: 'select-dropdown',
				width: 'full',
				options: {
					choices: [
						{ text: 'Skip', value: 'skip' },
						{ text: 'Error', value: 'error' },
					],
				},
				note: 'Entire source field absent or undefined: skip returns the item unchanged; error rejects the operation.',
			},
		},
		{
			field: 'nullInput',
			name: 'Null source',
			type: 'string',
			schema: { default_value: 'clear' },
			meta: {
				interface: 'select-dropdown',
				width: 'full',
				options: {
					choices: [
						{ text: 'Clear', value: 'clear' },
						{ text: 'Skip', value: 'skip' },
						{ text: 'Error', value: 'error' },
					],
				},
				note: 'Entire source field null: clear sets the destination to null subject to Overwrite; skip returns the item unchanged; error rejects.',
			},
		},
		{
			field: 'coordinatePrecision',
			name: 'Coordinate precision',
			type: 'integer',
			schema: { default_value: 8 },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Decimal places in output longitude/latitude, from 0 to 15.',
			},
		},
		{
			field: 'maxVertices',
			name: 'Maximum polygon vertices',
			type: 'integer',
			schema: { default_value: 1000 },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Total vertices across all rings, excluding closing duplicates. Larger polygons reject before calculation.',
			},
		},
		{
			field: 'maxAreaKm2',
			name: 'Maximum bounding-box area (km²)',
			type: 'float',
			schema: { default_value: 100000 },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Approximate geographic bounding-box area limit, as in the reference area hook. Larger polygons reject.',
			},
		},
	] satisfies NonNullable<Parameters<typeof defineOperationApp>[0]['options']>
}
