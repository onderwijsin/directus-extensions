import { z } from 'zod'

/**
 * Selects scalar key validation for a live field type without coercion.
 * @param type - Directus field type.
 * @returns Schema for canonical UUID, nonempty string, or safe integer keys.
 */
export function getManagementKeySchema(type: string | undefined) {
	if (type === 'uuid')
		return z.uuid().refine((value) => value === value.toLowerCase(), {
			error: 'Management requires canonical lowercase UUIDs',
		})
	if (type === 'integer' || type === 'bigInteger') return z.int()
	if (type === 'string') return z.string().min(1)
	throw new Error(`Unsupported management key type: ${type ?? 'missing'}`)
}
