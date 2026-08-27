/** Registers the Quick Copy display in Directus Studio. */
import { defineDisplay } from '@directus/extensions-sdk'

import QuickCopyDisplay from './display.vue'

export default defineDisplay({
	id: 'quick-copy-display',
	name: 'Quick Copy',
	icon: 'content_copy',
	description: 'Displays a value with a copy action.',
	component: QuickCopyDisplay,
	options: null,
	types: ['string', 'uuid', 'integer', 'bigInteger'],
})
