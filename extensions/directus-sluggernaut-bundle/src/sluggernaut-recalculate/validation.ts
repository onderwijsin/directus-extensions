import type { OperationContext } from '@directus/types'

import { ForbiddenError } from '@directus/errors'
import { hasKey } from '@onderwijsin/directus-extension-utils'

import { recalculateOptionsSchema, type RecalculateOptions } from './options.schema'

/** Re-exported operation input type for consumers of the validation boundary. */
export type { RecalculateOptions } from './options.schema'

/**
 * Authorizes and parses the recalculation operation input at its boundary.
 * @param options - Operation input.
 * @param context - Directus operation context.
 * @returns Validated operation options with schema defaults applied.
 */
export function validateRecalculateOptions(
	options: unknown,
	context: OperationContext,
): RecalculateOptions {
	const accountability = context.accountability
	const isAdmin =
		accountability === null ||
		accountability.admin === true ||
		(hasKey(accountability, 'admin_access') && accountability.admin_access === true)
	if (!isAdmin) throw new ForbiddenError()
	const parsed = recalculateOptionsSchema.safeParse(options)
	if (!parsed.success) throw new Error('Invalid Sluggernaut recalculation options.')
	return parsed.data
}
