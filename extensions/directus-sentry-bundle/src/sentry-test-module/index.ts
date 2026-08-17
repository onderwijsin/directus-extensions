import { defineModule } from '@directus/extensions-sdk'

import ModuleComponent from './module.vue'

export default defineModule({
	id: 'sentry-test-module',
	name: 'Sentry Test Module',
	icon: 'box',
	routes: [
		{
			path: '',
			component: ModuleComponent,
		},
	],
})
