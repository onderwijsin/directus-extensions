import { randomUUID } from 'node:crypto'

import { ofetch } from 'ofetch'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { normalizeFeature } from '../src/mapbox-address-interface/utils/normalize'
import { interfaceOptionsSchema } from '../src/mapbox-address-interface/utils/options.schema'
import { mapboxFeatureSchema } from '../src/mapbox-address-interface/utils/response.schema'
import { feature } from './fixtures/address'

describe('Extract Geolocation Data filter Flow', () => {
	it('persists the complete transformed create payload and preserves partial updates', async () => {
		const request = ofetch.create({
			baseURL: process.env.DIRECTUS_E2E_URL,
			headers: { Authorization: `Bearer ${process.env.DIRECTUS_E2E_TOKEN}` },
			/** Reports the Directus error body when fixture setup or persistence fails.
			 * @param context - Failed API response.
			 * @param context.response - Response carrying the Directus error.
			 * @returns Never; rejects the failed request.
			 */
			onResponseError: ({ response }) => {
				throw new Error(JSON.stringify(response._data))
			},
		})
		const collection = `geo_extract_${randomUUID().replaceAll('-', '')}`
		const flow = randomUUID()
		const operation = randomUUID()
		const address = normalizeFeature(
			mapboxFeatureSchema.parse(feature),
			interfaceOptionsSchema.parse({}),
		)
		await request('/collections', {
			method: 'POST',
			body: {
				collection,
				meta: {},
				schema: {},
			},
		})
		try {
			for (const field of [
				{ field: 'title', type: 'string', meta: { interface: 'input' } },
				{ field: 'address_data', type: 'json', meta: { interface: 'input-code' } },
				{ field: 'city', type: 'string', meta: { interface: 'input' } },
				{ field: 'street', type: 'string', meta: { interface: 'input' } },
				{ field: 'location_geopoint', type: 'geometry.Point', meta: { interface: 'map' } },
			]) {
				await request(`/fields/${collection}`, { method: 'POST', body: field })
			}
			await request('/flows', {
				method: 'POST',
				body: {
					id: flow,
					name: 'Geo extraction E2E',
					status: 'active',
					trigger: 'event',
					options: {
						type: 'filter',
						scope: ['items.create', 'items.update'],
						collections: [collection],
						return: '$last',
					},
				},
			})
			try {
				await request('/operations', {
					method: 'POST',
					body: {
						id: operation,
						flow,
						name: 'Extract address',
						key: 'extract_address',
						type: 'geo-extract-geolocation-operation',
						position_x: 0,
						position_y: 0,
						options: {
							payload: '{{ $trigger.payload }}',
							overwrite: 'preserve-input',
							outputs: {
								city: 'city',
								street: 'street',
								point: 'location_geopoint',
								country: 'nonexistent_field',
							},
						},
					},
				})
				await request(`/flows/${flow}`, { method: 'PATCH', body: { operation } })
				const created = z
					.object({
						data: z.looseObject({
							id: z.number(),
							title: z.string(),
							street: z.string(),
							city: z.string(),
							address_data: z.unknown(),
							location_geopoint: z.object({
								type: z.literal('Point'),
								coordinates: z.tuple([z.number(), z.number()]),
							}),
						}),
					})
					.parse(
						await request(`/items/${collection}`, {
							method: 'POST',
							body: { title: 'Office', address_data: address, city: 'Manual city' },
						}),
					)
				expect(created.data).not.toHaveProperty('nonexistent_field')
				expect(created.data).toMatchObject({
					title: 'Office',
					address_data: address,
					city: 'Manual city',
					street: address.components.street,
					location_geopoint: address.geometry,
				})
				const updated = await request<unknown>(`/items/${collection}/${created.data.id}`, {
					method: 'PATCH',
					body: { title: 'Renamed' },
				})
				expect(updated).toMatchObject({
					data: {
						title: 'Renamed',
						address_data: address,
						city: 'Manual city',
						street: address.components.street,
						location_geopoint: address.geometry,
					},
				})
			} finally {
				await request(`/flows/${flow}`, { method: 'DELETE' })
			}
		} finally {
			await request(`/collections/${collection}`, { method: 'DELETE' })
		}
	})
})
