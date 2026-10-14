import { z } from 'zod'

const fieldKey = z
	.string()
	.min(1)
	.refine(
		(key) => !['__proto__', 'prototype', 'constructor'].includes(key) && !/[.[\]]/u.test(key),
		'Use a direct, safe field key',
	)

/** Default extraction destinations; falsy mappings disable an output. */
export const defaultOutputs = {
	formattedAddress: 'formatted_address',
	address: 'address',
	street: 'street',
	houseNumber: 'house_number',
	city: 'city',
	postcode: 'postal_code',
	municipality: 'municipality',
	district: 'district',
	region: 'region',
	country: 'country',
	countryCode: 'country_code',
	longitude: 'longitude',
	latitude: 'latitude',
	point: 'location_geopoint',
}

const destinationSchema = z
	.union([fieldKey, z.literal(false), z.literal(0), z.literal(''), z.null()])
	.optional()

const outputsSchema = z.strictObject({
	formattedAddress: destinationSchema,
	address: destinationSchema,
	street: destinationSchema,
	houseNumber: destinationSchema,
	city: destinationSchema,
	postcode: destinationSchema,
	municipality: destinationSchema,
	district: destinationSchema,
	region: destinationSchema,
	country: destinationSchema,
	countryCode: destinationSchema,
	longitude: destinationSchema,
	latitude: destinationSchema,
	point: destinationSchema,
})

/** Validates extraction configuration without resolving Flow expressions. */
export const extractionOptionsSchema = z
	.strictObject({
		payload: z.unknown().optional(),
		inputField: fieldKey.default('address_data'),
		outputs: outputsSchema.default(() => ({ ...defaultOutputs })),
		overwrite: z.enum(['replace', 'fill-empty', 'preserve-input']).default('replace'),
		missingInput: z.enum(['skip', 'error']).default('skip'),
		nullInput: z.enum(['clear', 'skip', 'error']).default('clear'),
		missingComponent: z.enum(['null', 'skip', 'error']).default('null'),
		countryCodeCase: z.enum(['upper', 'lower', 'preserve']).default('upper'),
		coordinatePrecision: z.int().min(0).max(15).default(8),
	})
	.superRefine((options, context) => {
		const destinations = Object.values(options.outputs).filter(
			(value) => typeof value === 'string' && value !== '',
		)
		if (
			new Set(destinations).size !== destinations.length ||
			destinations.includes(options.inputField)
		) {
			context.addIssue({
				code: 'custom',
				path: ['outputs'],
				message: 'Destinations must be unique and differ from inputField',
			})
		}
	})
