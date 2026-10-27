import type { Snapshot } from '@directus/types'
import type { PersistedSnapshot } from './snapshot.schema'

/** File data accepts both the native service snapshot and its persisted YAML representation. */
export type PathToContent = Record<
	string,
	| Pick<Snapshot, 'version' | 'directus' | 'vendor'>
	| Snapshot['collections'][number]
	| Snapshot['fields'][number]
	| Snapshot['relations'][number]
	| Snapshot['systemFields'][number]
	| PersistedSnapshot['collections'][number]
	| PersistedSnapshot['fields'][number]
	| PersistedSnapshot['relations'][number]
	| PersistedSnapshot['systemFields'][number]
>
