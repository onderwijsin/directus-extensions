import { defineOperationApp } from '@directus/extensions-sdk'

/** Registers the Calculate Polygon Grid Points operation scaffold without configurable behavior. */
export default defineOperationApp({
	id: 'geo-polygon-grid-points-operation',
	name: 'Calculate Polygon Grid Points',
	icon: 'grid_on',
	description: 'Scaffold only; transformation is not implemented.',
	overview: null,
	options: [],
})
