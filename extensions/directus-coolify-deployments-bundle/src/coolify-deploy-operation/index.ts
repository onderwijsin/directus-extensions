import type { defineOperationApp } from '@directus/extensions-sdk'

import OperationOptions from './options.vue'

// Directus supports component options at runtime, but the SDK's
// Exclude<ComponentOptions, any> removes that branch from its options type.
type ComponentOperationConfig = Omit<Parameters<typeof defineOperationApp>[0], 'options'> & {
	options: typeof OperationOptions
}

export default {
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
	overview: ({ application }: { application?: string }) => [
		{
			label: 'Application',
			text: application,
		},
	],
	options: OperationOptions,
} satisfies ComponentOperationConfig
