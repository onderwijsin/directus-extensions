/**
 * Parses and converts an input value into a boolean. If the input value is a string,
 * it checks for specific truthy values ('true', '1'), ignoring case, and returns true.
 * Returns false for undefined inputs or values that do not match the criteria.
 *
 * @param {string|boolean|undefined} value - The input value to be converted to a boolean.
 * Can be of type string, boolean, or undefined.
 * @returns {boolean} The boolean representation of the input value. Returns true for
 * 'true' (case-insensitive) and '1', and false otherwise.
 */
export function parseBooleanEnv(value: unknown): boolean {
	if (typeof value === 'boolean') return value

	if (typeof value === 'string') {
		return value.toLowerCase() === 'true' || value === '1'
	}

	return false
}
