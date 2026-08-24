import { defineInterface } from '@directus/extensions-sdk'

import ApplicationSelect from './interface.vue'

export default defineInterface({
	id: 'coolify-deploy-application-select',
	name: 'Coolify application select',
	icon: 'rocket_launch',
	description: 'Select an enabled Coolify application available for deployment.',
	component: ApplicationSelect,
	types: ['string'],
	group: 'standard',
	options: [],
})
