import { defineOperationApp } from '@directus/extensions-sdk'

export default defineOperationApp({
	id: 'coolify-deploy',
	name: 'Coolify Deploy',
	icon: 'rocket_launch',
	description: 'Trigger a deployment for a configured frontend project.',
	overview: null,
	options: [
		{
			field: 'project',
			name: 'Project',
			type: 'string',
			meta: {
				width: 'full',
				interface: 'input',
			},
		},
		{
			field: 'force',
			name: 'Force rebuild',
			type: 'boolean',
			meta: {
				width: 'full',
				interface: 'boolean',
			},
		},
	],
})
