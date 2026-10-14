import { z } from 'zod'

/** WGS84 positions always use longitude before latitude. */
export const positionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])

/** Nullable normalized components retain postal codes and house numbers as text. */
export const addressComponentsSchema = z.strictObject({
	address: z.string().nullable(),
	street: z.string().nullable(),
	houseNumber: z.string().nullable(),
	city: z.string().nullable(),
	postcode: z.string().nullable(),
	municipality: z.string().nullable(),
	district: z.string().nullable(),
	region: z.string().nullable(),
	country: z.string().nullable(),
	countryCode: z
		.string()
		.regex(/^[A-Z]{2}$/u)
		.nullable(),
})

/** Supported geographic result types form a literal union in inferred address values. */
export const addressFeatureTypeSchema = z.enum([
	'country',
	'region',
	'postcode',
	'district',
	'place',
	'locality',
	'neighborhood',
	'street',
	'address',
])

/** Provider-neutral fields shared by normalized address values. */
export const addressValueSchema = z.strictObject({
	schemaVersion: z.literal(1),
	featureType: addressFeatureTypeSchema,
	formattedAddress: z.string().min(1),
	geometry: z.strictObject({ type: z.literal('Point'), coordinates: positionSchema }),
	components: addressComponentsSchema,
	language: z.string().min(1),
	storageMode: z.enum(['permanent', 'temporary']),
})
