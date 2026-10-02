const iconNamePattern = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/u

/**
 * Validates a stored Iconify identifier.
 * @param value The stored icon identifier.
 * @returns Whether the identifier has the collection:name form.
 */
export function isIconName(value: string | null | undefined): boolean {
	return typeof value === 'string' && iconNamePattern.test(value)
}
