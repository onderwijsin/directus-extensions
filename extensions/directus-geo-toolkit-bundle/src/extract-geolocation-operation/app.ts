import { defineOperationApp } from '@directus/extensions-sdk'

/** Registers the Extract Geolocation Data operation scaffold without configurable behavior. */
export default defineOperationApp({
	id: 'geo-extract-geolocation-operation',
	name: 'Extract Geolocation Data',
	icon: 'location_on',
	description: 'Scaffold only; transformation is not implemented.',
	overview: null,
	options: [],
})
