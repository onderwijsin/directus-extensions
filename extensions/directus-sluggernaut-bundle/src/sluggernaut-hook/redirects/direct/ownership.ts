import type { RedirectField } from '../schema'
import type { RedirectState } from './state'

import {
	isString,
	attemptSync,
	fromEntries,
	toEntries,
} from '@onderwijsin/directus-extension-utils'

import { normalizeExactRedirectDestination, normalizeExactRedirectOrigin } from '../normalization'

const STRUCTURAL_FIELDS = [
	'origin',
	'destination',
	'match',
	'type',
] as const satisfies readonly RedirectField[]
const PROVENANCE_FIELDS = [
	'managed_by',
	'source_collection',
	'source_item',
	'source_field',
	'source_type',
	'inactive_reason',
] as const satisfies readonly RedirectField[]
const PROVENANCE_FIELD_SET = new Set<string>(PROVENANCE_FIELDS)

/** Result of applying the pure ownership policy to a proposed state. */
export interface OwnershipDecision {
	transfersOwnership: boolean
	state: RedirectState
}

/** Compares structural fields using the domain's normalized representations where applicable.
 * @param field - Structural field.
 * @param left - Existing value.
 * @param right - Proposed value.
 * @returns Whether values are equivalent.
 */
function equivalentStructuralValue(
	field: (typeof STRUCTURAL_FIELDS)[number],
	left: unknown,
	right: unknown,
): boolean {
	if (field === 'origin' && isString(left) && isString(right)) {
		const { data, error } = attemptSync(
			() => normalizeExactRedirectOrigin(left) === normalizeExactRedirectOrigin(right),
		)
		if (error) return left === right
		return !!data
	}
	if (field === 'destination' && isString(left) && isString(right)) {
		const { data, error } = attemptSync(
			() =>
				normalizeExactRedirectDestination(left).value ===
				normalizeExactRedirectDestination(right).value,
		)
		if (error) return left === right
		return !!data
	}
	return Object.is(left, right)
}

/** Decides whether an external human mutation detaches a managed redirect.
 * @param existing - Previous state.
 * @param proposed - Complete proposed state.
 * @param mutationSource - Origin of the mutation.
 * @returns Ownership decision and transformed state.
 */
export function decideRedirectOwnership(
	existing: RedirectState,
	proposed: RedirectState,
	mutationSource: 'external' | 'internal' = 'external',
): OwnershipDecision {
	const structuralChange = STRUCTURAL_FIELDS.some(
		(field) => !equivalentStructuralValue(field, existing[field], proposed[field]),
	)
	const transfersOwnership =
		mutationSource === 'external' && existing.managed_by === 'sluggernaut' && structuralChange

	if (!transfersOwnership) return { transfersOwnership: false, state: proposed }
	return {
		transfersOwnership: true,
		state: fromEntries(
			toEntries(proposed).map(([field, value]) =>
				PROVENANCE_FIELD_SET.has(field) ? [field, null] : [field, value],
			),
		),
	}
}
