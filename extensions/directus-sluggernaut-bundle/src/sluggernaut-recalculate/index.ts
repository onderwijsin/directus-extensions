import { defineOperationApp } from '@directus/extensions-sdk'

/** Values shown in the operation overview card. */
interface RecalculateOverviewOptions {
	collection?: string
	fieldKeys?: string[]
	createRedirects?: boolean
}

/**
 * Shows the configured recalculation scope on the operation card.
 * @param options - Configured operation options.
 * @returns Operation overview fields.
 */
function getRecalculateOverview(options: RecalculateOverviewOptions) {
	const { collection, fieldKeys, createRedirects } = options

	return [
		{ label: 'Collection', text: collection ?? 'Not configured' },
		{ label: 'Fields', text: fieldKeys ? JSON.stringify(fieldKeys) : 'All derived fields' },
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
			name: 'Collection',
			type: 'string',
			meta: { width: 'full', interface: 'input', required: true },
		},
		{
			field: 'fieldKeys',
			name: 'Field keys',
			type: 'json',
			meta: {
				width: 'full',
				interface: 'input-code',
				note: 'Optional JSON array of exact field keys to recalculate.',
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
