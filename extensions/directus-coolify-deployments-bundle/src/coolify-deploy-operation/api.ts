import { defineOperationApi } from '@directus/extensions-sdk'

interface CoolifyDeployOptions {
	project: string
	force: boolean
}

export default defineOperationApi<CoolifyDeployOptions>({
	id: 'coolify-deploy',
	/**
	 * Trigger a Coolify deployment from a Directus Flow.
	 * @param _options - Configured operation options.
	 * @param _context - Directus operation context.
	 * @returns A normalized deployment result when implemented.
	 */
	handler: (_options, _context) => {
		throw new Error('Coolify deployment triggering is not implemented yet')
	},
})
