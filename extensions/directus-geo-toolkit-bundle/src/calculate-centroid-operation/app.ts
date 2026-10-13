import { defineOperationApp } from '@directus/extensions-sdk'

/** Registers the Calculate Polygon Centroid operation scaffold without configurable behavior. */
export default defineOperationApp({
	id: 'geo-calculate-centroid-operation',
	name: 'Calculate Polygon Centroid',
	icon: 'center_focus_strong',
	description: 'Scaffold only; transformation is not implemented.',
	overview: null,
	options: [],
})
