import type { OperationContext } from '@directus/types'

import { ForbiddenError } from '@directus/errors'
import { z } from 'zod'

import { recalculateOptionsSchema, type RecalculateOptions } from './options.schema'

/** Re-exported operation input type for consumers of the validation boundary. */
export type { RecalculateOptions } from './options.schema'

const accountabilitySchema = z
	.looseObject({
		admin: z.boolean().optional(),
		admin_access: z.boolean().optional(),
	})
	.nullable()

/**
 * Checks whether accountability represents an administrator or internal execution.
 * @param accountability - Directus accountability value.
 * @returns Whether recalculation is authorized.
 */
function hasAdministratorAccess(accountability: unknown): boolean {
	const parsed = accountabilitySchema.safeParse(accountability)
	if (!parsed.success) return false
	return parsed.data === null || parsed.data.admin === true || parsed.data.admin_access === true
}

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
	if (!hasAdministratorAccess(context.accountability)) throw new ForbiddenError()
	return recalculateOptionsSchema.parse(options)
}
