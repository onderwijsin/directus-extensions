import { keys, fromEntries } from '@onderwijsin/directus-extension-utils'

import { resolveEffectiveFieldValue } from '../../../shared/values/normalization'

/** A complete persisted redirect-like state, intentionally independent of Directus event shapes. */
export type RedirectState = Readonly<Record<string, unknown>>

/** Materializes a complete update state without fetching or interpreting persistence.
 * @param existing - Persisted state.
 * @param payload - Partial mutation payload.
 * @returns Complete proposed state.
 */
export function materializeRedirectState(
	existing: RedirectState,
	payload: RedirectState,
): RedirectState {
	const fields = new Set([...keys(existing), ...keys(payload)])
	return fromEntries(
		[...fields].map((field) => [field, resolveEffectiveFieldValue(payload, existing, field)]),
	)
}
