import type { Redirect, RedirectMutationInput } from '../schema'

import { keys } from '@onderwijsin/directus-extension-utils'

import { resolveEffectiveFieldValue } from '../../../shared/values/normalization'

/**
 * A materialized redirect state. Persisted states are `Redirect`; malformed pre-validation values
 * use the raw mutation shape so explicit nulls can reach the domain validator unchanged.
 */
export type RedirectState = Redirect | RawRedirectMutationInput

export type RawRedirectMutationInput = Omit<
	Partial<RedirectMutationInput>,
	| 'origin'
	| 'destination'
	| 'is_active'
	| 'managed_by'
	| 'source_collection'
	| 'source_item'
	| 'source_field'
	| 'source_type'
	| 'inactive_reason'
> & {
	origin?: string | null
	destination?: string | null
	is_active?: boolean
	managed_by?: Redirect['managed_by']
	source_collection?: Redirect['source_collection']
	source_item?: Redirect['source_item']
	source_field?: Redirect['source_field']
	source_type?: Redirect['source_type']
	inactive_reason?: Redirect['inactive_reason']
}

/** Materializes a complete update state without fetching or interpreting persistence.
 * @param existing - Persisted state.
 * @param payload - Partial mutation payload.
 * @returns Complete proposed state.
 */
export function materializeRedirectState(
	existing: Redirect,
	payload: Partial<RedirectMutationInput>,
): RedirectState
export function materializeRedirectState(
	existing: Redirect,
	payload: RawRedirectMutationInput,
): RedirectState
export function materializeRedirectState(
	existing: Redirect,
	payload: Partial<RedirectMutationInput> | RawRedirectMutationInput,
): RedirectState {
	const fields = keys(existing)
	const updates = Object.fromEntries(
		fields.map((field) => [field, resolveEffectiveFieldValue(payload, existing, field)]),
	)
	return Object.assign({ ...existing }, updates)
}
