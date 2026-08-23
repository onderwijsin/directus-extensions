import type { Redirect, RedirectCreateInput } from '../schema'

import { isDefined } from '@onderwijsin/directus-extension-utils'

import {
	normalizeExactRedirectDestination,
	normalizeExactRedirectOrigin,
	type ExactRedirectDestination,
} from './normalization'

/** Minimal input needed by the exact graph domain, derived from the redirect schema. */
export type ExactRedirectInput = Omit<
	Partial<RedirectCreateInput>,
	| 'match'
	| 'origin'
	| 'destination'
	| 'managed_by'
	| 'source_collection'
	| 'source_item'
	| 'source_field'
	| 'source_type'
	| 'inactive_reason'
> & {
	origin?: string | null
	destination?: string | null
	match?: Redirect['match']
	id?: Redirect['id']
	managed_by?: Redirect['managed_by']
	source_collection?: Redirect['source_collection']
	source_item?: Redirect['source_item']
	source_field?: Redirect['source_field']
	source_type?: Redirect['source_type']
	inactive_reason?: Redirect['inactive_reason']
}

/** A validated exact redirect with its destination classified for graph traversal. */
export type ValidatedExactRedirect = Omit<
	Pick<Redirect, 'id' | 'origin' | 'destination' | 'match' | 'is_active'>,
	'id' | 'origin' | 'destination' | 'match'
> & {
	id?: Redirect['id']
	origin: string
	destination: ExactRedirectDestination
	match: Extract<Redirect['match'], 'exact'>
}

/** Returns whether a record participates in the active exact graph.
 * @param record - Exact participation fields.
 * @returns Whether the record participates.
 */
export function participatesInActiveExactGraph(
	record: Pick<ExactRedirectInput, 'match' | 'is_active'>,
): boolean {
	return record.match === 'exact' && record.is_active === true
}

/** Validates and normalizes one exact redirect for use by the graph domain.
 * @param record - Raw exact redirect.
 * @returns Validated normalized redirect.
 */
export function validateExactRedirect(record: ExactRedirectInput): ValidatedExactRedirect {
	if (record.match !== 'exact')
		throw new Error('Exact integrity validation requires an exact redirect.')
	if (typeof record.is_active !== 'boolean')
		throw new Error('A redirect active state must be boolean.')
	const origin = normalizeExactRedirectOrigin(record.origin)
	const destination = normalizeExactRedirectDestination(record.destination)
	if (destination.kind === 'path' && origin === destination.value) {
		throw new Error('An exact redirect must not point to itself.')
	}
	return { id: record.id, origin, destination, match: 'exact', is_active: record.is_active }
}

/** Decides whether the proposed transition can affect active exact integrity.
 * @param previous - Previous state, or null for creation.
 * @param proposed - Complete proposed state.
 * @returns Whether graph context is required.
 */
export function requiresExactIntegrityLookup(
	previous: ExactRedirectInput | null,
	proposed: ExactRedirectInput,
): boolean {
	if (!participatesInActiveExactGraph(proposed)) return false
	if (previous === null || !participatesInActiveExactGraph(previous)) return true
	const previousOrigin = normalizeExactRedirectOrigin(previous.origin)
	const proposedOrigin = normalizeExactRedirectOrigin(proposed.origin)
	const previousDestination = normalizeExactRedirectDestination(previous.destination)
	const proposedDestination = normalizeExactRedirectDestination(proposed.destination)
	return (
		previousOrigin !== proposedOrigin ||
		previousDestination.kind !== proposedDestination.kind ||
		previousDestination.value !== proposedDestination.value
	)
}

/** Builds a stable identity key for a validated redirect.
 * @param record - Validated redirect.
 * @returns Identity key.
 */
function recordKey(record: ValidatedExactRedirect): string {
	return !isDefined(record.id) ? `origin:${record.origin}` : `id:${String(record.id)}`
}

/** Pure lookup frontier for a relevant, batched exact graph. */
export interface ExactGraphFrontier {
	requestedOrigins: string[]
	complete: boolean
}

/**
 * Derives the next origins the persistence adapter must fetch. `fetchedOrigins` must include
 * origins that were queried and found absent; this is what lets the planner prove closure.
 * @param candidates - Proposed mutation records.
 * @param resolvedRecords - Relevant records already fetched by the caller.
 * @param fetchedOrigins - Origins already queried, including absent results.
 * @returns The next lookup frontier and closure status.
 */
export function deriveExactGraphFrontier(
	candidates: readonly ExactRedirectInput[],
	resolvedRecords: readonly ExactRedirectInput[],
	fetchedOrigins: ReadonlySet<string> = new Set(),
): ExactGraphFrontier {
	const normalized = [...candidates, ...resolvedRecords]
		.filter(participatesInActiveExactGraph)
		.map(validateExactRedirect)
	const candidateRecords = candidates
		.filter(participatesInActiveExactGraph)
		.map(validateExactRedirect)
	const relevantOrigins = new Set(candidateRecords.map((record) => record.origin))
	for (const record of candidateRecords) {
		if (record.destination.kind === 'path') relevantOrigins.add(record.destination.value)
	}
	let expanded = true
	while (expanded) {
		expanded = false
		for (const record of normalized) {
			if (!relevantOrigins.has(record.origin) || record.destination.kind !== 'path') continue
			if (!relevantOrigins.has(record.destination.value)) {
				relevantOrigins.add(record.destination.value)
				expanded = true
			}
		}
	}
	const needed = relevantOrigins
	const requestedOrigins = [...needed].filter((origin) => !fetchedOrigins.has(origin))
	return { requestedOrigins, complete: requestedOrigins.length === 0 }
}

/**
 * Validates candidates against a supplied closed relevant subgraph, not an entire table.
 * @param candidates - Proposed records.
 * @param relevantRecords - Fetched records for the relevant closed subgraph.
 * @param fetchedOrigins - Origins queried by the persistence adapter, including absent origins.
 * @returns Nothing; throws when integrity is violated.
 */
export function validateRelevantExactRedirectGraph(
	candidates: readonly ExactRedirectInput[],
	relevantRecords: readonly ExactRedirectInput[],
	fetchedOrigins: ReadonlySet<string>,
): void {
	const candidateIds = new Set(
		candidates.flatMap((record) => (!isDefined(record.id) ? [] : [String(record.id)])),
	)
	const records = [
		...candidates,
		...relevantRecords.filter(
			(record) => !isDefined(record.id) || !candidateIds.has(String(record.id)),
		),
	]
		.filter((record) => record.match === 'exact')
		.map(validateExactRedirect)
	const active = records.filter((record) => record.is_active)
	const candidateOrigins = new Set<string>()
	for (const candidate of candidates
		.filter(participatesInActiveExactGraph)
		.map(validateExactRedirect)) {
		if (candidateOrigins.has(candidate.origin)) {
			throw new Error(`Multiple active exact candidates use origin "${candidate.origin}".`)
		}
		candidateOrigins.add(candidate.origin)
	}
	const origins = new Map<string, ValidatedExactRedirect>()
	for (const record of active) {
		const previous = origins.get(record.origin)
		if (isDefined(previous) && recordKey(previous) !== recordKey(record)) {
			throw new Error(`Multiple active exact redirects use origin "${record.origin}".`)
		}
		origins.set(record.origin, record)
	}
	const unresolvedOrigins = new Set<string>()
	for (const start of active) {
		if (!fetchedOrigins.has(start.origin)) unresolvedOrigins.add(start.origin)
	}
	for (const start of active) {
		const visited = new Set<string>()
		let current: ValidatedExactRedirect | undefined = start
		while (current?.destination.kind === 'path') {
			if (visited.has(current.origin))
				throw new Error('Active exact redirects must not contain a cycle.')
			visited.add(current.origin)
			if (
				!origins.has(current.destination.value) &&
				!fetchedOrigins.has(current.destination.value)
			) {
				unresolvedOrigins.add(current.destination.value)
			}
			current = origins.get(current.destination.value)
		}
	}
	if (unresolvedOrigins.size > 0) {
		throw new Error(
			`Exact redirect graph context is incomplete for origin(s): ${[...unresolvedOrigins].join(', ')}.`,
		)
	}
}
