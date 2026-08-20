import { defineModule } from '@directus/extensions-sdk'

import ApplicationView from './ApplicationView.vue'
import DeploymentView from './DeploymentView.vue'
import ModuleComponent from './module.vue'

export default defineModule({
	id: 'coolify-deployments',
	name: 'Deployments',
	icon: 'rocket_launch',
	routes: [
		{
			path: '',
			component: ModuleComponent,
		},
		{
			path: 'applications/:directusApplicationId',
			component: ApplicationView,
			props: true,
		},
		{
			path: 'applications/:directusApplicationId/deployments/:deploymentId',
			component: DeploymentView,
			props: true,
		},
	],
})
