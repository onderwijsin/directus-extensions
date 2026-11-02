import { z } from 'zod'

/** Parses the JSON indentation setting, including values pre-cast by Directus. */
export const jsonIndentSchema = z
	.union([z.literal('tab'), z.literal('2'), z.literal('4'), z.literal(2), z.literal(4)], {
		error: 'SEEDER_JSON_INDENT must be tab, 2, or 4',
	})
	.default('tab')
	.transform((value) => (value === 'tab' ? '\t' : value === '2' || value === 2 ? 2 : 4))

/**
 * Validate JSON indentation while preserving legacy handling of the other environment options.
 */
export const envSchema = z.looseObject({ SEEDER_JSON_INDENT: jsonIndentSchema })
