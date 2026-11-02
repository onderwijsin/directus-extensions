import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Ensures a directory exists while preserving existing mount, permissions, and ownership.
 * @param directory - Directory to create when absent.
 * @returns Resolves after the directory exists.
 */
export async function ensureDir(directory: string): Promise<void> {
	await mkdir(directory, { recursive: true })
}

/**
 * Removes only a directory's children, matching fs-extra's emptydir behavior.
 * @param directory - Directory whose contents should be removed.
 * @returns Resolves after all children are removed.
 */
export async function emptydir(directory: string): Promise<void> {
	await ensureDir(directory)
	const children = await readdir(directory)
	await Promise.all(
		children.map((child) => rm(join(directory, child), { recursive: true, force: true })),
	)
}

/**
 * Writes text or asset content after ensuring its parent directory exists.
 * @param filePath - Destination filename.
 * @param content - Serialized seeds or binary asset content.
 * @returns Resolves after the file is written.
 */
export async function outputFile(filePath: string, content: string | Uint8Array): Promise<void> {
	await ensureDir(dirname(filePath))
	await writeFile(filePath, content)
}
