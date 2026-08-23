import type { EventContext, HookExtensionContext, PrimaryKey } from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
import type { SluggernautEnv } from '../../configuration/env.schema'
import type { RawRedirectMutationInput, RedirectState } from '../domain/state'
import type { Redirect, RedirectField, RedirectMutationInput } from '../schema'

import { isDirectusError } from '@directus/errors'
import {
	attempt,
	isArray,
	isDefined,
	isPrimaryKey,
	isRecord,
	isString,
	hasKey,
} from '@onderwijsin/directus-extension-utils'

import {
	sluggernautIntegrityError,
	sluggernautInternalError,
	sluggernautValidationError,
} from '../../../shared/errors'
import {
	deriveExactGraphFrontier,
	materializeRedirectState,
	requiresExactIntegrityLookup,
	validateExactRedirect,
	validateRelevantExactRedirectGraph,
	decideRedirectOwnership,
	type ExactRedirectInput,
} from '../domain'
import { derivePatternMetadata } from '../patterns'
import { REDIRECT_FIELDS } from '../schema'
import { createRedirectService, type RedirectService } from '../service'
import { currentMutationSource } from './mutation-source'

const GRAPH_FIELDS = [
	'id',
	'origin',
	'destination',
	'match',
	'is_active',
] as const satisfies readonly RedirectField[]
const PATTERN_INTEGRITY_FIELDS = [
	'id',
	'match',
	'is_active',
	'matcher_signature',
] as const satisfies readonly RedirectField[]
const PROVENANCE_FIELDS = [
	'managed_by',
	'source_collection',
	'source_item',
	'source_field',
	'source_type',
	'inactive_reason',
] as const satisfies readonly RedirectField[]
type RedirectMutationPayload = Omit<
	Partial<RedirectMutationInput>,
	(typeof PROVENANCE_FIELDS)[number]
> &
	Partial<Pick<Redirect, (typeof PROVENANCE_FIELDS)[number]>>

/**
 * Translates a domain or persistence failure to a Directus payload error.
 * @param error - Failure raised by validation or persistence.
 * @param collection - Configured redirect collection.
 * @returns A Directus invalid-payload error.
 */
function mutationError(error: unknown, collection: string): Error {
	if (isDirectusError(error)) return error
	const message = error instanceof Error ? error.message : 'Unknown redirect validation failure.'
	return sluggernautValidationError(
		`Redirect mutation in "${collection}" was rejected: ${message}`,
	)
}

/**
 * Checks whether a state is an exact redirect.
 * @param value - Redirect-like state.
 * @returns Whether the state is exact.
 */
function isExact(value: ExactRedirectInput): boolean {
	return value.match === 'exact'
}

/**
 * Checks whether a complete redirect state is a pattern redirect.
 * @param value - Redirect-like state.
 * @returns Whether the state is a pattern.
 */
function isPattern(value: RedirectState | Partial<RedirectMutationInput>): boolean {
	return value.match === 'pattern'
}

/**
 * Derives and validates pattern metadata from a complete mutation state.
 * @param value - Complete resulting redirect state.
 * @returns Derived pattern metadata.
 */
function patternMetadata(value: RedirectState | Partial<RedirectMutationInput>) {
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
async function validatePatternIntegrity(
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

/**
 * Builds the exact fields required by the domain API.
 * @param value - Redirect-like state.
 * @returns Exact redirect input fields.
 */
function exactInput(
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

/**
 * Applies normalized path values to fields explicitly supplied by the caller.
 * @param payload - Original Directus mutation payload.
 * @param validated - Validated and normalized exact redirect.
 * @returns Payload with normalized path fields.
 */
function normalizedExactPayload(
	payload: Partial<RedirectMutationInput>,
	validated: ReturnType<typeof validateExactRedirect>,
): Partial<RedirectMutationInput> {
	const result = { ...payload }
	// Normalize only fields the caller supplied; omitted fields already came from the complete
	// materialized state and must not be copied back into Directus by this filter.
	if (hasKey(payload, 'origin')) result.origin = validated.origin
	if (hasKey(payload, 'destination') && validated.destination.kind === 'path') {
		result.destination = validated.destination.value
	}
	// Exact redirects cannot carry pattern metadata. Clear it whenever matching-related fields are
	// touched so stale values cannot survive an exact/pattern mode transition.
	if (
		hasKey(payload, 'match') ||
		hasKey(payload, 'specificity') ||
		hasKey(payload, 'matcher_signature')
	) {
		result.specificity = null
		result.matcher_signature = null
	}
	return result
}

/**
 * Applies normalized pattern paths, derived metadata, and manual ownership to a payload.
 * @param payload - Original Directus mutation payload.
 * @param state - Complete resulting redirect state.
 * @returns Payload with normalized paths and derived metadata.
 */
function normalizedPatternPayload(
	payload: Partial<RedirectMutationInput>,
	state: RedirectState | Partial<RedirectMutationInput>,
): Partial<RedirectMutationInput> {
	// Pattern metadata is derived from the complete resulting state, not from the partial payload.
	// This makes operational updates safe even when origin and destination were omitted.
	const metadata = patternMetadata(state)
	return {
		...payload,
		// Normalize paths only when they were part of this mutation; metadata always describes the
		// complete resulting pattern and therefore is always written.
		...(hasKey(payload, 'origin') ? { origin: metadata.origin } : {}),
		...(hasKey(payload, 'destination') ? { destination: metadata.destination } : {}),
		match: hasKey(payload, 'match') ? 'pattern' : payload.match,
		specificity: metadata.specificity,
		matcher_signature: metadata.matcher_signature,
		managed_by: null,
		source_collection: null,
		source_item: null,
		source_field: null,
		source_type: null,
		inactive_reason: null,
	}
}

/**
 * Returns the mutation fields needed after ownership transfer.
 * @param payload - Original Directus payload.
 * @param state - Complete transformed state.
 * @param transfersOwnership - Whether provenance must be cleared.
 * @returns Payload to continue through Directus.
 */
function resultPayload(
	payload: Partial<RedirectMutationInput>,
	state: Readonly<RedirectState | Partial<RedirectMutationInput>>,
	transfersOwnership: boolean,
): RedirectMutationPayload {
	if (!transfersOwnership) return payload
	return {
		...payload,
		managed_by: state.managed_by,
		source_collection: state.source_collection,
		source_item: state.source_item,
		source_field: state.source_field,
		source_type: state.source_type,
		inactive_reason: state.inactive_reason,
	}
}

/**
 * Resolves and validates the closed relevant exact graph.
 * @param service - Configured redirect persistence service.
 * @param candidates - Proposed exact redirects.
 * @param maxDepth - Maximum number of frontier expansion rounds.
 * @returns Nothing; rejects when integrity is invalid.
 */
async function validateGraph(
	service: RedirectService,
	candidates: readonly ExactRedirectInput[],
	maxDepth = 25,
): Promise<void> {
	if (!candidates.some((candidate) => requiresExactIntegrityLookup(null, candidate))) return
	const resolvedRecords: ExactRedirectInput[] = []
	const fetchedOrigins = new Set<string>()
	let depth = 0
	while (true) {
		// The domain derives the next batch from the candidate and records already resolved. It
		// includes both the candidate origin and internal path destinations, but never external URLs.
		const frontier = deriveExactGraphFrontier(candidates, resolvedRecords, fetchedOrigins)
		if (frontier.complete) break
		if (depth >= maxDepth)
			throw sluggernautValidationError(
				`The exact redirect graph exceeds the configured maximum depth of ${maxDepth}.`,
			)
		// Query only active exact redirects at the requested origins. This deliberately avoids
		// loading the complete redirect collection and keeps the adapter reusable for batched flows.
		const result = await service.readByQuery({
			filter: {
				_and: [
					{ match: { _eq: 'exact' } },
					{ is_active: { _eq: true } },
					{ origin: { _in: frontier.requestedOrigins } },
				],
			},
			fields: [...GRAPH_FIELDS],
			limit: -1,
		})
		// Mark every requested origin as resolved before processing results. An empty result is still
		// meaningful: it proves that the origin was queried and has no persisted redirect.
		frontier.requestedOrigins.forEach((origin) => fetchedOrigins.add(origin))
		// An update query can return persisted predecessors for candidates. Those rows are replaced by
		// the proposed candidates and must not expand the frontier through their old destinations.
		const candidateIds = new Set(
			candidates.flatMap((candidate) =>
				isDefined(candidate.id) ? [String(candidate.id)] : [],
			),
		)
		resolvedRecords.push(
			...result
				.map(exactInput)
				.filter((record) => !isDefined(record.id) || !candidateIds.has(String(record.id))),
		)
		depth += 1
	}
	// At closure, the domain validates uniqueness, self-loops, cycles, and the complete relevant
	// subgraph. The adapter does not reproduce any of those redirect semantics.
	validateRelevantExactRedirectGraph(candidates, resolvedRecords, fetchedOrigins)
}

/**
 * Reads one persisted redirect with the fields required for complete state materialization.
 * @param service - Redirect persistence service.
 * @param key - Redirect primary key.
 * @returns The persisted redirect state.
 */
async function readExisting(service: RedirectService, key: PrimaryKey) {
	return service.readOne(key, { fields: [...REDIRECT_FIELDS] })
}

/**
 * Reads every target of a bulk update with the complete fields needed for state materialization.
 * @param service - Redirect persistence service.
 * @param keys - Target primary keys from the Directus event.
 * @returns Persisted target records in event-key order.
 */
async function readExistingMany(service: RedirectService, keys: readonly PrimaryKey[]) {
	const records = await service.readByQuery({
		filter: { id: { _in: [...keys] } },
		fields: [...REDIRECT_FIELDS],
		limit: -1,
	})
	// Directus may return targets in an order different from the event keys. Index by primary key
	// first, then rebuild the event order so ownership and payload decisions stay deterministic.
	const byId = new Map(records.map((record) => [String(record.id), record]))
	return keys.map((key) => {
		const record = byId.get(String(key))
		if (!isDefined(record))
			throw sluggernautValidationError(`Redirect target "${String(key)}" was not found.`)
		return record
	})
}

/**
 * Handles a direct bulk update as one integrity preflight.
 * @param input - Directus state, persistence, and mutation context.
 * @returns The shared payload to continue through Directus.
 */
async function validateDirectRedirectUpdateMany(input: {
	context: HookExtensionContext
	collection: string
	eventContext: EventContext
	payload: Partial<RedirectMutationInput>
	keys: readonly PrimaryKey[]
	maxDepth?: number
}): Promise<RedirectMutationPayload> {
	const { context, collection, eventContext, payload, keys, maxDepth } = input
	// Resolve all targets before validating anything. A shared update payload can produce different
	// complete records depending on each target's current matcher and ownership state.
	const service = await createRedirectService(context, collection, eventContext.database)
	const existing = await readExistingMany(service, keys)
	const source = currentMutationSource()
	const proposed = existing.map((record) =>
		decideRedirectOwnership(record, materializeRedirectState(record, payload), source),
	)
	const proposedStates = proposed.map(({ state }) => state)
	const patternStates = proposedStates.filter(isPattern)
	if (
		patternStates.length > 0 &&
		(hasKey(payload, 'specificity') || hasKey(payload, 'matcher_signature'))
	)
		throw sluggernautValidationError(
			'Pattern specificity and matcher signature are system-derived and cannot be supplied in bulk updates.',
		)
	const patternStructuralChange =
		hasKey(payload, 'origin') || hasKey(payload, 'destination') || hasKey(payload, 'match')
	// Structural pattern updates must leave every target with the same matcher semantics because
	// Directus supplies one shared payload. Operational-only pattern updates skip this comparison.
	if (patternStructuralChange && patternStates.length > 0) {
		if (patternStates.length !== proposedStates.length)
			throw sluggernautValidationError(
				'Bulk updates cannot mix pattern and exact redirects when changing matcher fields.',
			)
		const metadata = patternStates.map(patternMetadata)
		const first = metadata[0]
		if (
			first !== undefined &&
			metadata.some(
				(value) =>
					value.specificity !== first.specificity ||
					value.matcher_signature !== first.matcher_signature,
			)
		)
			throw sluggernautValidationError(
				'Bulk pattern updates must produce identical matcher metadata for every target.',
			)
	}
	await validatePatternIntegrity(
		service,
		proposed.map(({ state }, index) => ({ state, id: existing[index]?.id })),
	)
	// Validate exact candidates independently and fold their normalized fields into the one payload
	// that Directus will apply to every target. Pattern targets are handled separately below.
	const exactCandidates = proposed.map(({ state }) => exactInput(state))
	const normalizedPayload = exactCandidates.reduce(
		(result, candidate) =>
			isExact(candidate)
				? normalizedExactPayload(result, validateExactRedirect(candidate))
				: result,
		payload,
	)
	let patternPayload = normalizedPayload
	if (patternStructuralChange && patternStates.length > 0) {
		const firstState = patternStates[0]
		if (firstState === undefined)
			throw sluggernautValidationError('Bulk pattern update has no resulting pattern state.')
		patternPayload = normalizedPatternPayload(normalizedPayload, firstState)
	}

	// Internal history writes already have graph coordination in the canonical planner. External
	// bulk writes must validate the resulting exact candidates against the closed relevant graph.
	// Internal history writes retain ownership but still receive local exact validation. The history
	// planner owns its graph coordination, so it must not be checked against an intermediate snapshot.
	if (source !== 'internal') {
		const graphAffecting = existing.some((record, index) => {
			const candidate = exactCandidates[index]
			return (
				isDefined(candidate) && requiresExactIntegrityLookup(exactInput(record), candidate)
			)
		})
		await validateGraph(service, graphAffecting ? exactCandidates : [], maxDepth)
	}

	const transfersOwnership = proposed.some(({ transfersOwnership }) => transfersOwnership)
	const preservesManagedOwnership = proposed.some(
		({ transfersOwnership, state }) =>
			!transfersOwnership && state.managed_by === 'sluggernaut',
	)
	if (transfersOwnership && preservesManagedOwnership)
		throw sluggernautIntegrityError(
			'Bulk redirect updates cannot mix managed structural edits with managed operational edits.',
		)
	// Ownership transfer uses a single null provenance payload because Directus applies one payload
	// to the complete updateMany target set.
	return resultPayload(
		patternPayload,
		transfersOwnership
			? {
					managed_by: null,
					source_collection: null,
					source_item: null,
					source_field: null,
					source_type: null,
					inactive_reason: null,
				}
			: (proposed[0]?.state ?? payload),
		transfersOwnership,
	)
}

/**
 * Handles one direct redirect create or update at the Directus mutation boundary.
 * @param input - Directus state, persistence, and mutation context.
 * @returns The payload to continue through Directus.
 */
export async function validateDirectRedirectMutation(input: {
	context: HookExtensionContext
	collection: string
	eventContext: EventContext
	payload: Partial<RedirectMutationInput>
	existing?: Redirect
	service?: RedirectService
	maxDepth?: number
}): Promise<RedirectMutationPayload> {
	const { context, collection, eventContext, payload, existing } = input
	const result = await attempt(async () => {
		// 1. Complete the proposed state before applying any policy. This preserves omitted fields,
		//    explicit nulls, and falsey values exactly as Directus supplied them.
		const source = currentMutationSource()

		// 2. Apply ownership policy to the complete state. Only external structural edits can clear
		//    provenance; internal history writes retain it.
		const owned = isDefined(existing)
			? decideRedirectOwnership(existing, materializeRedirectState(existing, payload), source)
			: {
					transfersOwnership: false,
					state: { match: 'exact' as const, is_active: true, ...payload },
				}
		const proposed = owned.state
		// Match mode is a closed domain value. Reject malformed external input before either matcher
		// path can accidentally treat it as an unvalidated redirect.
		if (proposed.match !== 'exact' && proposed.match !== 'pattern')
			throw sluggernautValidationError(
				'A redirect match must be either "exact" or "pattern".',
			)
		if (isPattern(proposed)) {
			const patternService = isDefined(input.service)
				? input.service
				: await createRedirectService(context, collection, eventContext.database)
			await validatePatternIntegrity(patternService, [{ state: proposed, id: existing?.id }])
			return normalizedPatternPayload(payload, proposed)
		}
		const exactProposed = exactInput(proposed)
		if (!isExact(exactProposed))
			return resultPayload(payload, proposed, owned.transfersOwnership)

		// 3. Validate the candidate locally before any database lookup. This catches malformed
		//    origins/destinations and self-loops at the smallest possible boundary.
		const validated = validateExactRedirect(exactProposed)
		const normalizedPayload = normalizedExactPayload(payload, validated)

		// Automatic history already resolves structural graphs through its planner and transaction-
		// local reads. Re-running frontier preflight here would reject concurrent planner writes against
		// an intermediate snapshot. Local exact validation still applies to those internal writes.
		if (source === 'internal')
			return resultPayload(normalizedPayload, proposed, owned.transfersOwnership)

		// 4. Ask the domain whether this transition can affect active exact integrity. Operational,
		//    scheduling, provenance-only, and deactivation changes return without graph service work.
		if (
			!requiresExactIntegrityLookup(
				isDefined(existing) ? exactInput(existing) : null,
				exactProposed,
			)
		)
			return resultPayload(normalizedPayload, proposed, owned.transfersOwnership)

		// 5. Resolve only the closed relevant origin frontier, reusing the update service when one
		//    already performed the persisted-record read.
		const service = isDefined(input.service)
			? input.service
			: await createRedirectService(context, collection, eventContext.database)
		await validateGraph(service, [exactProposed], input.maxDepth)

		// 6. Return only mutation fields. Never write system fields from the materialized state back
		//    into Directus accidentally; ownership transfer adds only the provenance nulls it needs.
		return resultPayload(normalizedPayload, proposed, owned.transfersOwnership)
	})
	if (result.error !== null) throw mutationError(result.error, collection)
	if (!isRecord(result.data))
		throw mutationError(
			sluggernautInternalError('Redirect mutation returned no payload.'),
			collection,
		)
	return result.data
}

/**
 * Registers direct exact redirect create/update filters for the configured collection.
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @param options - Validated Sluggernaut options.
 * @returns Nothing.
 */
export function registerDirectRedirectHooks(
	hook: RegisterFunctions,
	context: HookExtensionContext,
	options: SluggernautEnv,
): void {
	if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
	hook.filter('items.create', async (payload, meta, eventContext) => {
		// Ignore unrelated collections and malformed payloads so this filter composes with other
		// Directus item pipelines without changing their behavior.
		if (meta.collection !== options.SLUGGERNAUT_REDIRECTS_COLLECTION || !isRecord(payload))
			return payload
		return validateDirectRedirectMutation({
			context,
			collection: options.SLUGGERNAUT_REDIRECTS_COLLECTION,
			eventContext,
			payload,
			maxDepth: options.SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH,
		})
	})
	hook.filter('items.update', async (payload, meta, eventContext) => {
		// Single-target updates reuse the complete mutation validator; multiple targets use the bulk
		// preflight so all resulting records are checked before Directus persists any shared payload.
		if (meta.collection !== options.SLUGGERNAUT_REDIRECTS_COLLECTION || !isRecord(payload))
			return payload
		const result = await attempt(async () => {
			if (!isArray(meta.keys) || meta.keys.length === 0)
				throw sluggernautValidationError(
					'Direct redirect updates require one or more item keys.',
				)
			const keys = meta.keys.filter(isPrimaryKey)
			if (keys.length !== meta.keys.length)
				throw sluggernautValidationError('Direct redirect updates require valid item keys.')
			if (keys.length > 1)
				return validateDirectRedirectUpdateMany({
					context,
					collection: options.SLUGGERNAUT_REDIRECTS_COLLECTION,
					eventContext,
					payload,
					keys,
					maxDepth: options.SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH,
				})
			// A single key still needs a persisted read because partial updates must be validated against
			// the complete current redirect state.
			const key = keys[0]
			if (!isDefined(key))
				throw sluggernautValidationError('Direct redirect updates require one item key.')
			const service = await createRedirectService(
				context,
				options.SLUGGERNAUT_REDIRECTS_COLLECTION,
				eventContext.database,
			)
			const existing = await readExisting(service, key)
			return validateDirectRedirectMutation({
				context,
				collection: options.SLUGGERNAUT_REDIRECTS_COLLECTION,
				eventContext,
				payload,
				existing,
				service,
				maxDepth: options.SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH,
			})
		})
		if (result.error !== null)
			throw mutationError(result.error, options.SLUGGERNAUT_REDIRECTS_COLLECTION)
		if (!isRecord(result.data))
			throw mutationError(
				sluggernautInternalError('Redirect mutation returned no payload.'),
				options.SLUGGERNAUT_REDIRECTS_COLLECTION,
			)
		return result.data
	})
}
