import { defineDisplay } from '@directus/extensions-sdk'

import IconifyDisplay from './display.vue'

/** Registers the Iconify icon display for string fields. */
export default defineDisplay({
	id: 'iconify-display',
	name: 'Iconify Icon',
	icon: 'imagesmode',
	description: 'Render a stored Iconify icon.',
	component: IconifyDisplay,
	options: [
		{
			field: 'useProxy',
			name: 'Iconify API',
			type: 'boolean',
			meta: {
				interface: 'boolean',
				width: 'full',
				options: { label: 'Use proxy for Iconify API' },
			},
			schema: { default_value: true },
		},
	],
	types: ['string'],
})
