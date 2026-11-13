import { z } from 'zod'

/** Big-integer keys retain the canonical decimal representation returned by PostgreSQL. */
export const bigIntegerKeySchema = z.string().regex(/^(0|-?[1-9]\d*)$/u)

/**
 * Selects scalar key validation for a live field type without coercion.
 * @param type - Directus field type.
 * @returns Schema for canonical UUID, nonempty string, safe integer, or decimal bigint keys.
 */
export function getManagementKeySchema(type: string | undefined) {
	if (type === 'uuid')
		return z.uuid().refine((value) => value === value.toLowerCase(), {
			error: 'Management requires canonical lowercase UUIDs',
		})
	if (type === 'integer') return z.int()
	if (type === 'bigInteger') return bigIntegerKeySchema
	if (type === 'string') return z.string().min(1)
	throw new Error(`Unsupported management key type: ${type ?? 'missing'}`)
}
