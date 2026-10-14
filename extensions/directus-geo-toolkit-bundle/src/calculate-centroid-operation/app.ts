import { defineOperationApp } from '@directus/extensions-sdk'

import { polygonOperationOptions } from '../shared/polygon-options'

/** Registers the centroid payload transform in the Flow editor. */
export default defineOperationApp({
	id: 'geo-calculate-centroid-operation',
	name: 'Calculate Polygon Centroid',
	icon: 'center_focus_strong',
	description: 'Extend a payload with an area-weighted or spherical polygon centroid.',
	/**
	 * Summarizes the configured source, destination and method.
	 * @param options - Stored operation options.
	 * @param options.inputField - Source polygon field.
	 * @param options.outputField - Destination Point field.
	 * @param options.method - Centroid method.
	 * @returns Flow tile labels.
	 */
	overview: ({
		inputField,
		outputField,
		method,
	}: {
		inputField?: string
		outputField?: string
		method?: string
	}) => [
		{ label: 'Source', text: inputField ?? 'polygon' },
		{ label: 'Destination', text: outputField ?? 'centroid' },
		{ label: 'Method', text: method ?? 'projected-area' },
	],
	options: [
		...polygonOperationOptions('centroid'),
		{
			field: 'method',
			name: 'Centroid method',
			type: 'string',
			schema: { default_value: 'projected-area' },
			meta: {
				interface: 'select-dropdown',
				width: 'full',
				options: {
					choices: [
						{ text: 'Area-weighted', value: 'projected-area' },
						{ text: 'Spherical vertex average', value: 'spherical-vertex' },
					],
				},
				note: 'Area-weighted uses the local equal-area projection and subtracts holes. Spherical averages outer-ring vertex vectors and rejects holes. A centroid can lie outside a concave polygon.',
			},
		},
	],
})
