import { defineOperationApp } from '@directus/extensions-sdk'

/** Values shown in the operation overview card. */
interface RecalculateOverviewOptions {
	collection?: string
	fields?: string[]
	createRedirects?: boolean
}

/**
 * Shows the configured recalculation scope on the operation card.
 * @param options - Configured operation options.
 * @returns Operation overview fields.
 */
function getRecalculateOverview(options: RecalculateOverviewOptions) {
	const { collection, fields, createRedirects } = options

	return [
		{ label: 'Collection', text: collection ?? 'Not configured' },
		{ label: 'Fields', text: fields ? JSON.stringify(fields) : 'All derived fields' },
		{ label: 'Create redirects', text: createRedirects ? 'Yes' : 'No' },
	]
}

export default defineOperationApp({
	id: 'sluggernaut-recalculate',
	name: 'Sluggernaut: Recalculate Fields',
	icon: 'sync',
	description: 'Recalculate configured Sluggernaut fields for a collection.',
	overview: getRecalculateOverview,
	options: [
		{
			field: 'collection',
			name: '$t:collection',
			type: 'string',
			meta: {
				interface: 'system-collection',
				options: {
					includeSystem: false,
				},
			},
		},
		{
			field: 'fields',
			name: 'Fields',
			type: 'json',
			meta: {
				width: 'full',
				interface: 'system-fields',
				options: {
					collectionField: 'collection',
				},
			},
		},
		{
			field: 'createRedirects',
			name: 'Create redirects',
			type: 'boolean',
			meta: { width: 'half', interface: 'checkbox' },
			schema: { default_value: true },
		},
	],
})
