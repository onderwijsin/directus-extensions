import { defineOperationApp } from '@directus/extensions-sdk'

import { polygonOperationOptions } from '../shared/polygon-options'

/** Registers the adaptive polygon grid payload transform in the Flow editor. */
export default defineOperationApp({
	id: 'geo-polygon-grid-points-operation',
	name: 'Calculate Polygon Grid Points',
	icon: 'grid_on',
	description: 'Extend a payload with a regular grid of points inside a polygon.',
	/**
	 * Summarizes the source, destination and target count range.
	 * @param options - Stored operation options.
	 * @param options.inputField - Polygon source key.
	 * @param options.outputField - MultiPoint destination key.
	 * @param options.minPoints - Minimum output count.
	 * @param options.maxPoints - Maximum output count.
	 * @returns Flow tile labels.
	 */
	overview: ({
		inputField,
		outputField,
		minPoints,
		maxPoints,
	}: {
		inputField?: string
		outputField?: string
		minPoints?: number
		maxPoints?: number
	}) => [
		{ label: 'Source', text: inputField ?? 'polygon' },
		{ label: 'Destination', text: outputField ?? 'grid_points' },
		{ label: 'Point count', text: `${minPoints ?? 0}–${maxPoints ?? 500}` },
	],
	options: [
		...polygonOperationOptions('grid_points'),
		{
			field: 'spacing',
			name: 'Initial grid spacing',
			type: 'float',
			schema: { default_value: 8 },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Starting distance between grid positions, in Units. Spacing adjusts when needed to meet Minimum/Maximum points.',
			},
		},
		{
			field: 'units',
			name: 'Units',
			type: 'string',
			schema: { default_value: 'kilometers' },
			meta: {
				interface: 'select-dropdown',
				width: 'full',
				options: {
					choices: [
						{ text: 'Kilometres', value: 'kilometers' },
						{ text: 'Metres', value: 'meters' },
					],
				},
				note: 'Applies to initial spacing and both clearance distances.',
			},
		},
		{
			field: 'minPoints',
			name: 'Minimum points',
			type: 'integer',
			schema: { default_value: 0 },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Grid spacing decreases when fewer points are found. An unattainable count range rejects the operation.',
			},
		},
		{
			field: 'maxPoints',
			name: 'Maximum points',
			type: 'integer',
			schema: { default_value: 500 },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Grid spacing increases when too many points are found. Output is never truncated.',
			},
		},
		{
			field: 'maxCandidates',
			name: 'Maximum candidate positions',
			type: 'integer',
			schema: { default_value: 10000 },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Work bound per spacing attempt, checked before scanning. Must be at least Maximum points. Spacing becomes coarser when the candidate grid is larger.',
			},
		},
		{
			field: 'minimumBoundaryDistance',
			name: 'Minimum boundary distance',
			type: 'float',
			schema: { default_value: 0 },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Clearance from every exterior and hole edge, in Units. Boundary points themselves are always excluded.',
			},
		},
		{
			field: 'minimumVertexDistance',
			name: 'Minimum vertex distance',
			type: 'float',
			schema: { default_value: 0 },
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Independent clearance from every ring vertex, in Units. Set to 8 kilometres for the legacy hook’s vertex exclusion.',
			},
		},
		{
			field: 'emptyResult',
			name: 'Empty result',
			type: 'string',
			schema: { default_value: 'null' },
			meta: {
				interface: 'select-dropdown',
				width: 'full',
				options: {
					choices: [
						{ text: 'Null', value: 'null' },
						{ text: 'Empty MultiPoint', value: 'empty-multipoint' },
						{ text: 'Error', value: 'error' },
					],
				},
				note: 'Applies only when zero points satisfies Minimum points. Empty MultiPoint support depends on the destination database.',
			},
		},
	],
})
