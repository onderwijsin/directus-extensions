import type { HookExtensionContext } from '@directus/types'

import { fromSnapshotToPathToContent } from './fromSnapshotToPathToContent'
import { getSchemaService } from './getSchemaService'
import { withSnapshotLock, writeSnapshotFiles } from './snapshotFiles'

/**
 * Exclusively captures and writes the current schema, publishing metadata after all definitions.
 * @param outputFolder - Directory for the snapshot files.
 * @param context - Directus services and logger.
 * @param signal - Stops snapshot work when an automatic task loses its lease.
 * @returns A promise that resolves after the snapshot is written.
 */
export async function createSnapshot(
	outputFolder: string,
	context: HookExtensionContext,
	signal?: AbortSignal,
): Promise<void> {
	const { logger } = context
	if (!outputFolder) throw new Error('No snapshot folder provided')
	await withSnapshotLock(async () => {
		signal?.throwIfAborted()

		const schemaService = await getSchemaService(context)
		logger.info('🔹 Schema service initialized')
		const nativeSnapshot = await schemaService.snapshot()
		logger.info('🔹 Got current schema snapshot')
		signal?.throwIfAborted()
		const pathToYamlContent = fromSnapshotToPathToContent(nativeSnapshot, logger)
		logger.info(
			`🔹 Processed current snapshot into ${Object.keys(pathToYamlContent).length} smaller items`,
		)

		await writeSnapshotFiles(outputFolder, pathToYamlContent, true, signal)
	})
}
