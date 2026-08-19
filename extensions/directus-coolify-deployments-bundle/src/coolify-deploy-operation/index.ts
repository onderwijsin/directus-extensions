import { defineOperationApp } from '@directus/extensions-sdk'

export default defineOperationApp({
	id: 'coolify-deploy',
	name: 'Coolify Deploy',
	icon: 'rocket_launch',
	description: 'Trigger a deployment for a configured Coolify application.',
	/**
	 * Shows the selected application on the flow operation card.
	 * @param options - Configured operation options.
	 * @param options.application - Directus ID of the configured application.
	 * @returns The operation card overview.
	 */
	overview: ({ application }) => [
		{
			label: 'Application',
			text: application,
		},
	],
	options: [
		{
			field: 'application',
			name: 'Application',
			type: 'string',
			meta: {
				width: 'full',
				interface: 'select-dropdown-m2o',
				options: {
					collectionName: 'coolify_applications',
					filter: {
						enabled: { _eq: true },
						deploy_enabled: { _eq: true },
					},
				},
			},
		},
	],
})
