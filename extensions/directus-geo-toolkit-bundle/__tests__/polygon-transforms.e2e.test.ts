import { randomUUID } from 'node:crypto'

import { ofetch } from 'ofetch'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { geoJsonPointSchema, positionSchema } from '../src/shared/geometry.schema'

const polygon = {
	type: 'Polygon',
	coordinates: [
		[
			[4.8, 52],
			[5, 52],
			[5, 52.2],
			[4.8, 52.2],
			[4.8, 52],
		],
	],
}
const itemSchema = z.object({
	data: z.object({
		id: z.number(),
		title: z.string(),
		polygon: z.unknown(),
		centroid: geoJsonPointSchema.nullable(),
		grid_points: z
			.object({ type: z.literal('MultiPoint'), coordinates: z.array(positionSchema) })
			.nullable(),
	}),
})

describe('polygon transform filter Flow', () => {
	it('persists chained and separate polygon transforms when filter triggers return their results', async () => {
		const request = ofetch.create({
			baseURL: process.env.DIRECTUS_E2E_URL,
			headers: { Authorization: `Bearer ${process.env.DIRECTUS_E2E_TOKEN}` },
			/**
			 * Exposes the Directus response when a synthetic test request fails.
			 * @param context - Failed request context.
			 * @param context.response - Directus error response.
			 * @returns Never; throws the response body.
			 */
			onResponseError: ({ response }) => {
				throw new Error(JSON.stringify(response._data))
			},
		})
		const collection = `geo_polygons_${randomUUID().replaceAll('-', '')}`
		const flow = randomUUID()
		const centroid = randomUUID()
		const grid = randomUUID()
		await request('/collections', {
			method: 'POST',
			body: { collection, meta: {}, schema: {} },
		})
		try {
			for (const field of [
				{ field: 'title', type: 'string', meta: { interface: 'input' } },
				{ field: 'polygon', type: 'geometry.Polygon', meta: { interface: 'map' } },
				{ field: 'centroid', type: 'geometry.Point', meta: { interface: 'map' } },
				{ field: 'grid_points', type: 'geometry.MultiPoint', meta: { interface: 'map' } },
			])
				await request(`/fields/${collection}`, { method: 'POST', body: field })
			await request('/flows', {
				method: 'POST',
				body: {
					id: flow,
					name: 'Polygon transforms E2E',
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
						id: grid,
						flow,
						name: 'Grid',
						key: 'grid',
						type: 'geo-polygon-grid-points-operation',
						position_x: 1,
						position_y: 0,
						options: {
							payload: '{{ center }}',
							overwrite: 'preserve-input',
							minPoints: 4,
							maxPoints: 12,
						},
					},
				})
				await request('/operations', {
					method: 'POST',
					body: {
						id: centroid,
						flow,
						name: 'Centroid',
						key: 'center',
						type: 'geo-calculate-centroid-operation',
						position_x: 0,
						position_y: 0,
						resolve: grid,
						options: { payload: '{{ $trigger.payload }}', overwrite: 'preserve-input' },
					},
				})
				await request(`/flows/${flow}`, { method: 'PATCH', body: { operation: centroid } })
				const created = itemSchema.parse(
					await request(`/items/${collection}`, {
						method: 'POST',
						body: { title: 'Service area', polygon },
					}),
				).data
				expect(created).toMatchObject({ title: 'Service area', polygon })
				expect(created.centroid?.coordinates[0]).toBeCloseTo(4.9, 2)
				expect(created.centroid?.coordinates[1]).toBeCloseTo(52.1, 2)
				expect(created.grid_points?.coordinates.length).toBeGreaterThanOrEqual(4)
				expect(created.grid_points?.coordinates.length).toBeLessThanOrEqual(12)
				const path = `/items/${collection}/${created.id}`
				const partial = itemSchema.parse(
					await request(path, { method: 'PATCH', body: { title: 'Renamed' } }),
				).data
				expect(partial).toEqual({ ...created, title: 'Renamed' })
				const manual = { type: 'Point', coordinates: [4.85, 52.05] }
				const overridden = itemSchema.parse(
					await request(path, { method: 'PATCH', body: { polygon, centroid: manual } }),
				).data
				expect(overridden.centroid).toEqual(manual)
				const cleared = itemSchema.parse(
					await request(path, { method: 'PATCH', body: { polygon: null } }),
				).data
				expect(cleared).toMatchObject({
					title: 'Renamed',
					polygon: null,
					centroid: null,
					grid_points: null,
				})

				const triggerOptions = {
					type: 'filter',
					scope: ['items.create', 'items.update'],
					collections: [collection],
				}
				await request(`/flows/${flow}`, {
					method: 'PATCH',
					body: { options: triggerOptions },
				})
				const withoutResponse = itemSchema.parse(
					await request(path, { method: 'PATCH', body: { polygon } }),
				).data
				expect(withoutResponse).toMatchObject({
					polygon,
					centroid: null,
					grid_points: null,
				})

				// Separate returning filters on the same hook must preserve each other's output.
				await request(`/flows/${flow}`, {
					method: 'PATCH',
					body: { options: { ...triggerOptions, return: '$last' } },
				})
				await request(`/operations/${centroid}`, {
					method: 'PATCH',
					body: { resolve: null },
				})
				const gridFlow = randomUUID()
				await request('/flows', {
					method: 'POST',
					body: {
						id: gridFlow,
						name: 'Separate polygon grid E2E',
						status: 'active',
						trigger: 'event',
						options: { ...triggerOptions, return: '$last' },
					},
				})
				try {
					await request(`/operations/${grid}`, {
						method: 'PATCH',
						body: {
							flow: gridFlow,
							options: {
								payload: '{{ $trigger.payload }}',
								minPoints: 4,
								maxPoints: 12,
							},
						},
					})
					await request(`/flows/${gridFlow}`, {
						method: 'PATCH',
						body: { operation: grid },
					})
					const separate = itemSchema.parse(
						await request(path, { method: 'PATCH', body: { polygon } }),
					).data
					expect(separate).toEqual({ ...created, title: 'Renamed' })
				} finally {
					await request(`/flows/${gridFlow}`, { method: 'DELETE' })
				}
			} finally {
				await request(`/flows/${flow}`, { method: 'DELETE' })
			}
		} finally {
			await request(`/collections/${collection}`, { method: 'DELETE' })
		}
	})
})
