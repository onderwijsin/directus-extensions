import type { PathToContent } from './types'

import { mkdir, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { dump as toYaml } from 'js-yaml'

/**
 * Excludes other bundle writers and applies in processes sharing the temporary directory.
 * The claim deliberately never expires: a paused owner must not overlap a replacement owner.
 * @param operation - Complete snapshot, migration, or apply operation.
 * @returns A promise that resolves after the operation and lock cleanup.
 */
export async function withSnapshotLock(operation: () => Promise<void>): Promise<void> {
	const directory = path.join(os.tmpdir(), 'directus-schema-snapshot')
	const lockPath = path.join(directory, 'operation.lock')
	await mkdir(directory, { recursive: true })
	try {
		await mkdir(lockPath)
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
			throw new Error(`Another schema-split operation holds ${lockPath}`, { cause: error })
		}
		throw error
	}
	try {
		await operation()
	} finally {
		await rmdir(lockPath)
	}
}

/**
 * Publishes metadata only after every definition is written, keeping incomplete output unusable.
 * Call within withSnapshotLock; retain the output directory itself for mounted snapshot folders.
 * @param outputFolder - Directory for the existing split YAML format.
 * @param files - Snapshot definitions indexed by their relative paths.
 * @param clear - Whether to remove existing output, as snapshot does but migrate does not.
 * @param signal - Optional automatic-task cancellation signal.
 * @returns A promise that resolves after metadata is atomically published.
 */
export async function writeSnapshotFiles(
	outputFolder: string,
	files: PathToContent,
	clear: boolean,
	signal?: AbortSignal,
): Promise<void> {
	const relativeCoordinationPath = path.relative(
		path.resolve(outputFolder),
		path.join(os.tmpdir(), 'directus-schema-snapshot'),
	)
	if (
		!path.isAbsolute(relativeCoordinationPath) &&
		relativeCoordinationPath !== '..' &&
		!relativeCoordinationPath.startsWith(`..${path.sep}`)
	) {
		throw new Error('Snapshot output must not contain the schema-split coordination directory')
	}
	// Serialize before touching published output so conversion failures preserve the old snapshot.
	const serialized = Object.entries(files).map(([filename, content]) => ({
		filename,
		content: toYaml(content, { noRefs: true }),
	}))
	const metadata = serialized.find(({ filename }) => filename === 'metadata.yml')
	if (!metadata) throw new Error('Snapshot metadata is required')
	signal?.throwIfAborted()
	await mkdir(outputFolder, { recursive: true })
	await rm(path.join(outputFolder, 'metadata.yml'), { force: true })
	if (clear) {
		for (const entry of await readdir(outputFolder)) {
			signal?.throwIfAborted()
			await rm(path.join(outputFolder, entry), { recursive: true, force: true })
		}
	}
	for (const { filename, content } of serialized) {
		if (filename === 'metadata.yml') continue
		signal?.throwIfAborted()
		const absolutePath = path.join(outputFolder, filename)
		await mkdir(path.dirname(absolutePath), { recursive: true })
		await writeFile(absolutePath, content, { signal })
	}
	const temporaryMetadata = path.join(outputFolder, '.metadata.yml.tmp')
	try {
		signal?.throwIfAborted()
		await writeFile(temporaryMetadata, metadata.content, { signal })
		signal?.throwIfAborted()
		await rename(temporaryMetadata, path.join(outputFolder, 'metadata.yml'))
	} finally {
		await rm(temporaryMetadata, { force: true })
	}
}
