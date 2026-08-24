import type { ExactRedirectInput } from '../domain'
import type { RawRedirectMutationInput } from '../domain/state'
import type { Redirect, RedirectMutationInput } from '../schema'

import { isPrimaryKey } from '@onderwijsin/directus-extension-utils'

/**
 * Checks whether a state is an exact redirect.
 * @param value - Redirect-like state.
 * @returns Whether the state is exact.
 */
export function isExact(value: ExactRedirectInput): boolean {
	return value.match === 'exact'
}

/**
 * Checks whether a complete redirect state is a pattern redirect.
 * @param value - Redirect-like state.
 * @returns Whether the state is a pattern.
 */
export function isPattern(value: { match?: RedirectMutationInput['match'] }): boolean {
	return value.match === 'pattern'
}

/**
 * Builds the exact fields required by the domain API.
 * @param value - Redirect-like state.
 * @returns Exact redirect input fields.
 */
export function exactInput(
	value: Redirect | Partial<RedirectMutationInput> | RawRedirectMutationInput,
): ExactRedirectInput {
	const exact: ExactRedirectInput = {
		origin: value.origin,
		destination: value.destination,
		match: value.match,
		is_active: value.is_active,
	}
	if ('id' in value && isPrimaryKey(value.id)) exact.id = value.id
	return exact
}
