/** Synthetic v6 feature; no personal data or real provider credentials. */
export const feature = {
	type: 'Feature',
	geometry: { type: 'Point', coordinates: [4.9, 52.3] },
	properties: {
		mapbox_id: 'synthetic-address',
		feature_type: 'address',
		full_address: 'Example Street 10, Example City',
		context: {
			address: { street_name: 'Example Street', address_number: '10' },
			place: { name: 'Example City' },
			postcode: { name: '0012 AB' },
			country: { name: 'Example Country', country_code: 'nl' },
			district: { name: 'Example District' },
		},
	},
}
export const response = {
	type: 'FeatureCollection',
	features: [feature],
	attribution: 'Synthetic Mapbox attribution',
}
