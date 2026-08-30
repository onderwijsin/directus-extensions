import { defineModule } from '@directus/extensions-sdk'

import { ARTICLE_ROUTE, MODULE_ID, MODULE_NAME } from '../shared/constants'
import ModuleComponent from './module.vue'

/** Registers the Studio Docs module and its phase-one route contract. */
export default defineModule({
	id: MODULE_ID,
	name: MODULE_NAME,
	icon: 'menu_book',
	routes: [
		{
			path: '',
			component: ModuleComponent,
		},
		{
			path: ARTICLE_ROUTE.slice(1),
			component: ModuleComponent,
			props: true,
		},
	],
})
