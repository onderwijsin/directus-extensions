import type {
	HookExtensionContext,
	Snapshot,
	SnapshotDiff,
	SnapshotDiffWithHash,
} from '@directus/types'
import type { PersistedSnapshot } from './snapshot.schema'

/**
 * Directus accepts persisted snapshots, whose fields omit Studio-only properties such as name.
 * Keep its native snapshot/apply types while describing the actual persisted diff input.
 */
interface SchemaService {
	snapshot(): Promise<Snapshot>
	diff(
		snapshot: Snapshot | PersistedSnapshot,
		options: {
			currentSnapshot: Snapshot
			force: boolean
		},
	): Promise<SnapshotDiff | null>
	apply(payload: SnapshotDiffWithHash): Promise<void>
}

/**
 * Creates the host SchemaService with administrator accountability for CLI schema management.
 * @param context - Directus services and database configuration.
 * @returns The initialized host service.
 */
export async function getSchemaService(context: HookExtensionContext): Promise<SchemaService> {
	const schema = await context.getSchema()
	return new context.services.SchemaService({
		knex: context.database,
		schema,
		accountability: {
			role: null,
			roles: [],
			user: null,
			admin: true,
			app: false,
			ip: null,
		},
	})
}
