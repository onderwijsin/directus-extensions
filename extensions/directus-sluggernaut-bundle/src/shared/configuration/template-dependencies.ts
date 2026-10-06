import type { SluggernautFieldMetadata } from './types'

import { INTERFACE_IDS } from './constants'

const scalarTypes = new Set([
	'string',
	'text',
	'integer',
	'bigInteger',
	'float',
	'decimal',
	'boolean',
	'date',
	'time',
	'dateTime',
	'timestamp',
	'uuid',
])

/**
 * Validates scalar dependency availability independently of any mutation payload.
 * @param field - Referenced field, or undefined for a missing reference.
 * @param validSlugFields - Slug fields whose configuration has passed discovery.
 * @returns Whether this field may participate in a generated permalink template.
 */
export function isSupportedTemplateDependency(
	field: SluggernautFieldMetadata | undefined,
	validSlugFields: ReadonlySet<string>,
): field is SluggernautFieldMetadata {
	return (
		field !== undefined &&
		scalarTypes.has(field.type ?? '') &&
		field.schema?.has_auto_increment !== true &&
		field.schema?.is_generated !== true &&
		!field.schema?.generation_expression &&
		(field.schema?.default_value === undefined || field.schema.default_value === null) &&
		(field.meta?.special?.length ?? 0) === 0 &&
		!field.schema?.foreign_key_table &&
		field.meta?.interface !== INTERFACE_IDS.permalink &&
		(field.meta?.interface !== INTERFACE_IDS.slug || validSlugFields.has(field.field))
	)
}
