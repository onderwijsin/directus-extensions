import { createError, isDirectusError } from '@directus/errors'

/** Extensions carried by Sluggernaut errors whose message is determined at the throw site. */
export interface SluggernautErrorExtensions {
	reason: string
}

/** A client supplied value or mutation violates Sluggernaut's contract. */
export const SluggernautValidationError = createError<SluggernautErrorExtensions>(
	'SLUGGERNAUT_VALIDATION',
	({ reason }) => reason,
	400,
)

/** A redirect mutation conflicts with the active redirect domain's integrity rules. */
export const SluggernautIntegrityError = createError<SluggernautErrorExtensions>(
	'SLUGGERNAUT_INTEGRITY',
	({ reason }) => reason,
	409,
)

/** Sluggernaut configuration or schema state is invalid for the requested operation. */
export const SluggernautConfigurationError = createError<SluggernautErrorExtensions>(
	'SLUGGERNAUT_CONFIGURATION',
	({ reason }) => reason,
	500,
)

/** Sluggernaut reached an impossible internal state. */
export const SluggernautInternalError = createError<SluggernautErrorExtensions>(
	'SLUGGERNAUT_INTERNAL',
	({ reason }) => reason,
	500,
)

/**
 * Creates a Directus error for invalid consumer input.
 * @param reason - Consumer-facing validation reason.
 * @returns Directus validation error.
 */
export function sluggernautValidationError(reason: string): Error {
	return new SluggernautValidationError({ reason })
}

/**
 * Creates a Directus error for an active redirect integrity conflict.
 * @param reason - Integrity conflict reason.
 * @returns Directus integrity error.
 */
export function sluggernautIntegrityError(reason: string): Error {
	return new SluggernautIntegrityError({ reason })
}

/**
 * Creates a Directus error for invalid extension configuration or schema state.
 * @param reason - Configuration failure reason.
 * @returns Directus configuration error.
 */
export function sluggernautConfigurationError(reason: string): Error {
	return new SluggernautConfigurationError({ reason })
}

/**
 * Creates a Directus error for an impossible internal extension state.
 * @param reason - Internal state failure reason.
 * @returns Directus internal error.
 */
export function sluggernautInternalError(reason: string): Error {
	return new SluggernautInternalError({ reason })
}

/**
 * Preserves Directus errors and translates unknown failures at an extension boundary.
 * @param error - Failure raised by an underlying operation.
 * @param fallback - Error constructor for unknown failures.
 * @param reason - Safe message exposed when the failure is not a Directus error.
 * @returns A Directus-compatible error.
 */
export function toSluggernautError(
	error: unknown,
	fallback: typeof SluggernautInternalError = SluggernautInternalError,
	reason = 'Sluggernaut encountered an unexpected error.',
): Error {
	if (isDirectusError(error)) return error
	return new fallback({ reason })
}
