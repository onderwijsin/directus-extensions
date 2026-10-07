import { defineModule } from '@directus/extensions-sdk'

import ApplicationView from './ApplicationView.vue'
import DeploymentView from './DeploymentView.vue'
import ModuleComponent from './module.vue'
import ModuleView from './ModuleView.vue'

export default defineModule({
	id: 'coolify-deployments',
	name: 'Deployments',
	icon: 'rocket_launch',
	routes: [
		{
			path: '',
			component: ModuleView,
			children: [
				{ path: '', component: ModuleComponent },
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
		},
	],
})
