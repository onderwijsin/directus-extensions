/** Registers the Sluggernaut link display in Directus Studio. */
import { defineDisplay } from '@directus/extensions-sdk'

import LinkDisplay from './display.vue'

export default defineDisplay({
	id: 'sluggernaut-link',
	name: 'Sluggernaut Link',
	icon: 'link',
	description: 'Display a stored slug or permalink with copy and optional open actions.',
	component: LinkDisplay,
	types: ['string'],
	options: [
		{
			field: 'host',
			name: 'Host',
			type: 'string',
			meta: {
				width: 'full',
				interface: 'input',
				note: 'Optional HTTP(S) origin used by the Open action.',
			},
		},
	],
})
