import type { EventContext, HookExtensionContext, PrimaryKey } from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
import type { SluggernautEnv } from '../../configuration/env.schema'
import type { RawRedirectMutationInput, RedirectState } from '../domain/state'
import type { Redirect, RedirectCreateInput, RedirectField } from '../schema'

import { InvalidPayloadError } from '@directus/errors'
import {
	attempt,
	isArray,
	isDefined,
	isPrimaryKey,
	isRecord,
	hasKey,
} from '@onderwijsin/directus-extension-utils'

import {
	deriveExactGraphFrontier,
	materializeRedirectState,
	requiresExactIntegrityLookup,
	validateExactRedirect,
	validateRelevantExactRedirectGraph,
	decideRedirectOwnership,
	type ExactRedirectInput,
} from '../domain'
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
const PROVENANCE_FIELDS = [
	'managed_by',
	'source_collection',
	'source_item',
	'source_field',
	'source_type',
	'inactive_reason',
] as const satisfies readonly RedirectField[]
type RedirectMutationPayload = Omit<
	Partial<RedirectCreateInput>,
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
	if (error instanceof InvalidPayloadError) return error
	const message = error instanceof Error ? error.message : 'Unknown redirect validation failure.'
	return new InvalidPayloadError({
		reason: `Redirect mutation in "${collection}" was rejected: ${message}`,
	})
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
 * Builds the exact fields required by the domain API.
 * @param value - Redirect-like state.
 * @returns Exact redirect input fields.
 */
function exactInput(
	value: Redirect | Partial<RedirectCreateInput> | RawRedirectMutationInput,
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
	payload: Partial<RedirectCreateInput>,
	validated: ReturnType<typeof validateExactRedirect>,
): Partial<RedirectCreateInput> {
	const result = { ...payload }
	if (hasKey(payload, 'origin')) result.origin = validated.origin
	if (hasKey(payload, 'destination') && validated.destination.kind === 'path') {
		result.destination = validated.destination.value
	}
	return result
}

/**
 * Returns the mutation fields needed after ownership transfer.
 * @param payload - Original Directus payload.
 * @param state - Complete transformed state.
 * @param transfersOwnership - Whether provenance must be cleared.
 * @returns Payload to continue through Directus.
 */
function resultPayload(
	payload: Partial<RedirectCreateInput>,
	state: Readonly<RedirectState | Partial<RedirectCreateInput>>,
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
 * @param candidate - Proposed exact redirect.
 * @param maxDepth - Maximum number of frontier expansion rounds.
 * @returns Nothing; rejects when integrity is invalid.
 */
async function validateGraph(
	service: RedirectService,
	candidate: ExactRedirectInput,
	maxDepth = 25,
): Promise<void> {
	if (!requiresExactIntegrityLookup(null, candidate)) return
	const resolvedRecords: ExactRedirectInput[] = []
	const fetchedOrigins = new Set<string>()
	let depth = 0
	while (true) {
		// The domain derives the next batch from the candidate and records already resolved. It
		// includes both the candidate origin and internal path destinations, but never external URLs.
		const frontier = deriveExactGraphFrontier([candidate], resolvedRecords, fetchedOrigins)
		if (frontier.complete) break
		if (depth >= maxDepth)
			throw new Error(
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
		// An update query can return the persisted predecessor at the candidate's origin. That row is
		// replaced by the candidate and must not expand the frontier through its old destination.
		resolvedRecords.push(
			...result
				.map(exactInput)
				.filter(
					(record) =>
						!isDefined(candidate.id) ||
						!isDefined(record.id) ||
						String(record.id) !== String(candidate.id),
				),
		)
		depth += 1
	}
	// At closure, the domain validates uniqueness, self-loops, cycles, and the complete relevant
	// subgraph. The adapter does not reproduce any of those redirect semantics.
	validateRelevantExactRedirectGraph([candidate], resolvedRecords, fetchedOrigins)
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
 * Handles one direct redirect create or update at the Directus mutation boundary.
 * @param input - Directus state, persistence, and mutation context.
 * @returns The payload to continue through Directus.
 */
export async function validateDirectRedirectMutation(input: {
	context: HookExtensionContext
	collection: string
	eventContext: EventContext
	payload: Partial<RedirectCreateInput>
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
		await validateGraph(service, exactProposed, input.maxDepth)

		// 6. Return only mutation fields. Never write system fields from the materialized state back
		//    into Directus accidentally; ownership transfer adds only the provenance nulls it needs.
		return resultPayload(normalizedPayload, proposed, owned.transfersOwnership)
	})
	if (result.error !== null) throw mutationError(result.error, collection)
	if (!isRecord(result.data))
		throw mutationError(new Error('Redirect mutation returned no payload.'), collection)
	return result.data
}

/**
 * Registers direct exact redirect create/update filters for the configured collection.
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @param options - Validated Sluggernaut options.
 * @returns Nothing.
 */
export function registerDirectExactRedirectHooks(
	hook: RegisterFunctions,
	context: HookExtensionContext,
	options: SluggernautEnv,
): void {
	if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
	hook.filter('items.create', async (payload, meta, eventContext) => {
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
		if (meta.collection !== options.SLUGGERNAUT_REDIRECTS_COLLECTION || !isRecord(payload))
			return payload
		const result = await attempt(async () => {
			if (!isArray(meta.keys) || meta.keys.length !== 1 || !isPrimaryKey(meta.keys[0]))
				throw new Error('Direct redirect updates require one item key.')
			const service = await createRedirectService(
				context,
				options.SLUGGERNAUT_REDIRECTS_COLLECTION,
				eventContext.database,
			)
			const existing = await readExisting(service, meta.keys[0])
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
				new Error('Redirect mutation returned no payload.'),
				options.SLUGGERNAUT_REDIRECTS_COLLECTION,
			)
		return result.data
	})
}
