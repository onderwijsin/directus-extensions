import { defineInterface } from '@directus/extensions-sdk'

import PermalinkInterface from './interface.vue'

export default defineInterface({
	id: 'sluggernaut-permalink',
	name: 'Sluggernaut Permalink',
	icon: 'link',
	description: 'Editable-but-locked absolute URL path managed by Sluggernaut.',
	component: PermalinkInterface,
	types: ['string'],
	group: 'standard',
	options: [
		{
			field: 'generateFromSlug',
			name: 'Generate from slug',
			type: 'boolean',
			meta: { width: 'half', interface: 'checkbox' },
			schema: { default_value: true },
		},
		{
			field: 'slugField',
			name: 'Slug field',
			type: 'string',
			meta: {
				width: 'half',
				interface: 'input',
				note: 'Must reference a Sluggernaut slug field in this collection.',
			},
		},
		{
			field: 'updateOnSlugChange',
			name: 'Update on slug change',
			type: 'boolean',
			meta: { width: 'half', interface: 'checkbox' },
			schema: { default_value: false },
		},
		{
			field: 'prefix',
			name: 'Prefix',
			type: 'string',
			meta: { width: 'half', interface: 'input' },
		},
		{
			field: 'validatePrefixOnManualInput',
			name: 'Validate prefix on manual input',
			type: 'boolean',
			meta: { width: 'half', interface: 'checkbox' },
			schema: { default_value: false },
		},
		{
			field: 'trailingSlash',
			name: 'Trailing slash',
			type: 'boolean',
			meta: { width: 'half', interface: 'checkbox' },
			schema: { default_value: false },
		},
		{
			field: 'enforceTrailingSlashOnManualInput',
			name: 'Enforce trailing slash on manual input',
			type: 'boolean',
			meta: { width: 'half', interface: 'checkbox' },
			schema: { default_value: false },
		},
		{
			field: 'automaticRedirects',
			name: 'Automatic redirects',
			type: 'boolean',
			meta: { width: 'half', interface: 'checkbox' },
			schema: { default_value: false },
		},
	],
})
