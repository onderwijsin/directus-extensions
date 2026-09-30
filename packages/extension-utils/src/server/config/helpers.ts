import { z, type ZodOptional, type ZodPreprocess, type ZodString, type ZodStringFormat } from 'zod'

/**
 * Converts blank string input to undefined before validating an optional string field.
 *
 * Environment managers commonly emit an empty string for an unset optional variable. This preserves
 * the field's normal validation for non-blank strings while treating whitespace-only input as absent.
 * @param field - An optional string field.
 * @returns The field with blank string input treated as undefined.
 */
export function emptyStringToUndefined<T extends string>(
	field: ZodOptional<ZodStringFormat<T> | ZodString>,
): ZodPreprocess<ZodOptional<ZodStringFormat<T> | ZodString>> {
	return z.preprocess(
		(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
		field,
	)
}
