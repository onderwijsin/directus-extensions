/** Registers the readonly Quick Copy interface in Directus Studio. */
import { defineInterface } from '@directus/extensions-sdk'

import QuickCopyInput from './interface.vue'

export default defineInterface({
	id: 'quick-copy-interface',
	name: 'Quick Copy',
	icon: 'content_copy',
	description: 'Readonly field input with a copy action.',
	component: QuickCopyInput,
	options: null,
	types: ['string', 'uuid', 'integer', 'bigInteger'],
	group: 'standard',
})
