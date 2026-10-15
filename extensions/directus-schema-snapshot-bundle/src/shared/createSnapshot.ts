import type { HookExtensionContext } from '@directus/types'

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { dump as toYaml } from 'js-yaml'

import { fromSnapshotToPathToContent } from './fromSnapshotToPathToContent'
import { getSchemaService } from './getSchemaService'

/**
 * Splits the current schema into YAML files, clearing the output folder before writing.
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

	await mkdir(outputFolder, { recursive: true })
	for (const entry of await readdir(outputFolder)) {
		signal?.throwIfAborted()
		await rm(path.join(outputFolder, entry), { recursive: true, force: true })
	}
	logger.info('📁 Cleared output folder')
	logger.trace('📄 Start writing files...')

	for (const [relativeFilePath, fileContent] of Object.entries(pathToYamlContent)) {
		signal?.throwIfAborted()
		const absoluteFilePath = path.join(outputFolder, relativeFilePath)
		const yamlOutput = toYaml(fileContent, { noRefs: true })
		await mkdir(path.dirname(absoluteFilePath), { recursive: true })
		await writeFile(absoluteFilePath, yamlOutput, { signal })
		logger.trace(`📄 Wrote file: ${relativeFilePath}`)
	}
}
