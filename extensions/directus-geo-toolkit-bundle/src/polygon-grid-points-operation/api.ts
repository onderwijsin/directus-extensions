import { defineOperationApi } from '@directus/extensions-sdk'

/** Registers the Calculate Polygon Grid Points operation with an intentionally empty handler. */
export default defineOperationApi({
	id: 'geo-polygon-grid-points-operation',
	/**
	 * Reserves the operation handler for the payload transform implementation.
	 * @returns No result while this operation remains a scaffold.
	 */
	handler: () => {
		// TODO: Implement the payload transform described in SPEC.md.
	},
})
