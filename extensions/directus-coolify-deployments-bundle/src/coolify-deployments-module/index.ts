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
			path: 'applications/:applicationId',
			component: ApplicationView,
			props: true,
		},
		{
			path: 'applications/:applicationId/deployments/:deploymentId',
			component: DeploymentView,
			props: true,
		},
	],
})
