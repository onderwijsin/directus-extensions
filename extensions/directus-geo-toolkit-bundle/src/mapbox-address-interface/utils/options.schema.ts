import { z } from 'zod'

import {
	addressComponentsSchema,
	addressFeatureTypeSchema,
	positionSchema,
} from '../../shared/address.schema'

/** Configurable Geocoding result types reuse the normalized address literal union. */
export { addressFeatureTypeSchema as featureTypeSchema } from '../../shared/address.schema'

/** Property paths cannot reach prototype properties or execute expressions. */
const sourcePathSchema = z
	.string()
	.regex(/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/u)
	.refine(
		(path) =>
			!path
				.split('.')
				.some((segment) => ['__proto__', 'prototype', 'constructor'].includes(segment)),
		'Use a safe property path.',
	)

/** Token-free Mapbox style URL accepted by the renderer. */
const mapStyleSchema = z
	.string()
	.refine(
		(url) =>
			/^mapbox:\/\/styles\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/u.test(url) ||
			/^https:\/\/api\.mapbox\.com\/styles\/v1\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/u.test(url),
		'Use a Mapbox style URL without a token or query string.',
	)

/** Supported worldview names map to the provider codes kept in stored configuration. */
export const worldviews = z.enum({
	Argentina: 'ar',
	China: 'cn',
	India: 'in',
	Japan: 'jp',
	Morocco: 'ma',
	Serbia: 'rs',
	Russia: 'ru',
	Turkey: 'tr',
	'United States': 'us',
})

/** Validated configuration and shared defaults for the registration and component. */
export const interfaceOptionsSchema = z.strictObject({
	mapboxKey: z.string().trim().nullable().default(null),
	permanent: z.boolean().default(true),
	language: z
		.string()
		.regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*(?:,[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)*$/u)
		.default('en'),
	countries: z.array(z.string().regex(/^[A-Za-z]{2}$/u)).default([]),
	featureTypes: z.array(addressFeatureTypeSchema).min(1).default(['address', 'street', 'place']),
	autocomplete: z.boolean().default(true),
	minQueryLength: z.number().int().nonnegative().default(3),
	debounceMs: z.number().int().nonnegative().default(300),
	resultLimit: z.number().int().min(1).max(10).default(5),
	proximity: z
		.union([positionSchema, z.literal('ip')])
		.nullable()
		.default(null),
	worldview: worldviews.default('us'),
	componentSources: z
		.partialRecord(addressComponentsSchema.keyof(), z.array(sourcePathSchema))
		.default({}),
	styleUrl: mapStyleSchema.optional(),
	lightStyleUrl: mapStyleSchema.default('mapbox://styles/mapbox/light-v11'),
	darkStyleUrl: mapStyleSchema.default('mapbox://styles/mapbox/dark-v11'),
	showMap: z.boolean().default(true),
	mapHeightPx: z.number().int().positive().default(300),
	defaultCenter: positionSchema.default([0, 0]),
	defaultZoom: z.number().min(0).max(22).default(2),
	selectedZoom: z.number().min(0).max(22).default(15),
	allowClear: z.boolean().default(true),
})

/** Canonical defaults shared by Studio option metadata and runtime validation. */
export const interfaceDefaults = interfaceOptionsSchema.parse({})
