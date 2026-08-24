import type { PrimaryKey } from '@directus/types'
import type { RedirectState } from '../domain/state'
import type { RedirectMutationInput } from '../schema'
import type { RedirectService } from '../service'

import { isDefined, isString } from '@onderwijsin/directus-extension-utils'

import { sluggernautIntegrityError, sluggernautValidationError } from '../../../shared/errors'
import { derivePatternMetadata } from '../patterns'
import { PATTERN_INTEGRITY_FIELDS } from './fields'
import { isPattern } from './state'

/**
 * Derives and validates pattern metadata from a complete mutation state.
 * @param value - Complete resulting redirect state.
 * @returns Derived pattern metadata.
 */
export function patternMetadata(value: RedirectState | Partial<RedirectMutationInput>) {
	if (!isString(value.origin) || !isString(value.destination))
		throw sluggernautValidationError(
			'A pattern redirect requires string origin and destination values.',
		)
	return derivePatternMetadata(value.origin, value.destination)
}

/**
 * Validates that active pattern candidates are unique by matching semantics.
 * @param service - Configured redirect persistence service.
 * @param candidates - Complete resulting pattern states and their existing IDs.
 * @returns Nothing; rejects when an equivalent active pattern exists.
 */
export async function validatePatternIntegrity(
	service: RedirectService,
	candidates: readonly {
		state: RedirectState | Partial<RedirectMutationInput>
		id?: PrimaryKey
	}[],
): Promise<void> {
	// Only active patterns participate in redirect resolution, so inactive and exact candidates
	// cannot conflict with the matching semantics enforced here.
	const active = candidates.filter(({ state }) => isPattern(state) && state.is_active === true)
	if (active.length === 0) return

	// Derive metadata from the complete post-mutation state rather than trusting caller-supplied
	// fields. This gives every candidate the canonical signature used by persisted records.
	const derived = active.map(({ state, id }) => ({
		id,
		metadata: patternMetadata(state),
	}))
	const candidateSignatures = new Set<string>()
	for (const candidate of derived) {
		// Detect collisions within one bulk request before querying Directus. This also prevents two
		// new records in the same request from bypassing the persisted-record check below.
		if (candidateSignatures.has(candidate.metadata.matcher_signature))
			throw sluggernautIntegrityError(
				`Multiple active patterns use matcher signature "${candidate.metadata.matcher_signature}".`,
			)
		candidateSignatures.add(candidate.metadata.matcher_signature)
	}

	// Query only active pattern records whose canonical signatures are candidates for collision.
	// The narrow query keeps the check independent of unrelated redirect records and signatures.
	const records = await service.readByQuery({
		filter: {
			_and: [
				{ match: { _eq: 'pattern' } },
				{ is_active: { _eq: true } },
				{ matcher_signature: { _in: [...candidateSignatures.keys()] } },
			],
		},
		fields: [...PATTERN_INTEGRITY_FIELDS],
		limit: -1,
	})
	// An update naturally reads its own existing record back. Exclude those IDs so an unchanged
	// pattern, or a pattern changing only its destination, is not mistaken for a duplicate.
	const candidateIds = new Set(derived.flatMap(({ id }) => (isDefined(id) ? [String(id)] : [])))
	for (const record of records) {
		// Keep the defensive checks because the service boundary is typed around Directus data and
		// may still return malformed or stale rows in a real installation.
		if (!isDefined(record.id) || candidateIds.has(String(record.id))) continue
		if (record.match !== 'pattern' || record.is_active !== true) continue
		if (isString(record.matcher_signature) && candidateSignatures.has(record.matcher_signature))
			throw sluggernautIntegrityError(
				`An active pattern already uses matcher signature "${record.matcher_signature}".`,
			)
	}
}
