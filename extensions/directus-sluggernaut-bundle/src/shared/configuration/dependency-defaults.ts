import { isBoolean, isFiniteNumber, isString } from '@onderwijsin/directus-extension-utils'

/**
 * Identifies scalar defaults that can be resolved before the database inserts an item.
 * Directus exposes literal strings and SQL expressions through the same metadata property.
 * Reject compact function calls and known SQL defaults; preserve prose containing parentheses.
 * @param value - Default exposed by Directus field metadata.
 * @returns Whether the default is a supported literal scalar.
 */
export function isLiteralDependencyDefault(value: unknown): value is string | number | boolean {
	if (isBoolean(value) || isFiniteNumber(value)) return true
	if (!isString(value)) return false
	const text = value.trim()
	return (
		!/^CURRENT_(?:TIMESTAMP|DATE|TIME)$/iu.test(text) &&
		!/^(?:CURRENT_TIMESTAMP|now|gen_random_uuid)\s*\([\s\S]*\)$/iu.test(text) &&
		!/^[A-Za-z_][A-Za-z0-9_.]*\([\s\S]*\)$/u.test(text)
	)
}
