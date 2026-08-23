import { AsyncLocalStorage } from 'node:async_hooks'

// See the repository decision record for the replica-safety and alternative analysis:
// [async-local mutation source context](../../../../../../docs/decisions/async-local-mutation-source.md)

/** Identifies writes initiated by Sluggernaut itself. */
export type MutationSource = 'external' | 'internal'

const mutationSource = new AsyncLocalStorage<MutationSource>()

/**
 * Runs a callback with a mutation source local to the current asynchronous request.
 * @param source - Source of the mutation.
 * @param callback - Mutation work to run.
 * @returns The callback result.
 */
export function withMutationSource<T>(source: MutationSource, callback: () => T): T {
	return mutationSource.run(source, callback)
}

/**
 * Returns the current mutation source, defaulting to an external Directus mutation.
 * @returns The current mutation source.
 */
export function currentMutationSource(): MutationSource {
	return mutationSource.getStore() ?? 'external'
}
