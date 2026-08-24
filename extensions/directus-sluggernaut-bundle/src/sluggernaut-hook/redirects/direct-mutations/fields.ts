import type { Redirect, RedirectField, RedirectMutationInput } from '../schema'

export const GRAPH_FIELDS = [
	'id',
	'origin',
	'destination',
	'match',
	'is_active',
] as const satisfies readonly RedirectField[]
export const PATTERN_INTEGRITY_FIELDS = [
	'id',
	'match',
	'is_active',
	'matcher_signature',
] as const satisfies readonly RedirectField[]
export const PROVENANCE_FIELDS = [
	'managed_by',
	'source_collection',
	'source_item',
	'source_field',
	'source_type',
	'inactive_reason',
] as const satisfies readonly RedirectField[]
export type RedirectMutationPayload = Omit<
	Partial<RedirectMutationInput>,
	(typeof PROVENANCE_FIELDS)[number]
> &
	Partial<Pick<Redirect, (typeof PROVENANCE_FIELDS)[number]>>
