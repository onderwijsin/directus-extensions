import { defineInterface } from '@directus/extensions-sdk'

import InterfaceComponent from './interface.vue'

/** Registers the empty Geo Toolkit address interface for JSON fields. */
export default defineInterface({
	id: 'geo-mapbox-address-interface',
	name: 'Mapbox Address',
	icon: 'location_on',
	description: 'Scaffold only; address search and map rendering are not implemented.',
	component: InterfaceComponent,
	types: ['json'],
	group: 'standard',
	options: [],
})
