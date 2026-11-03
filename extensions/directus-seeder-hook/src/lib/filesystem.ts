import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'

/**
 * Checks every existing path component without following directory symlinks.
 * @param directory - Resolved output directory to inspect.
 * @returns Canonical path, including any not-yet-existing suffix.
 */
async function validateDirectory(directory: string): Promise<string> {
	let current = path.parse(directory).root
	if (directory === current) throw new Error(`Unsafe extraction directory: ${directory}`)
	for (const component of directory.slice(current.length).split(path.sep)) {
		current = path.join(current, component)
		try {
			const entry = await lstat(current)
			if (entry.isSymbolicLink() || !entry.isDirectory()) {
				throw new Error(
					`Extraction directory must not traverse symlinks or files: ${current}`,
				)
			}
		} catch (error) {
			if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
				const parent = path.dirname(current)
				return path.join(await realpath(parent), path.relative(parent, directory))
			}
			throw error
		}
	}
	return realpath(directory)
}

/**
 * Ensures a directory exists while preserving existing mount, permissions, and ownership.
 * @param directory - Directory to create when absent.
 * @returns Resolves after the directory exists.
 */
async function ensureDir(directory: string): Promise<void> {
	await validateDirectory(directory)
	await mkdir(directory, { recursive: true })
	await validateDirectory(directory)
}

/**
 * Validates both managed locations before creating or cleaning either of them.
 * @param folders - Configured JSON and binary output directories.
 * @param jsonOnly - Whether binary output must remain untouched.
 * @param skipClean - Whether existing output should be retained.
 * @returns Resolved output directories for the rest of this extraction.
 */
export async function prepareExtractionDirectories(
	folders: { seeds: string; assets: string },
	jsonOnly: boolean,
	skipClean: boolean,
): Promise<{ seeds: string; assets: string }> {
	const seeds = await validateDirectory(path.resolve(folders.seeds))
	const assets = await validateDirectory(path.resolve(folders.assets))
	if (seeds === assets || seeds.startsWith(`${assets}${path.sep}`)) {
		throw new Error('Extraction directories conflict: assets must not equal or contain seeds')
	}
	await ensureDir(seeds)
	if (!jsonOnly) await ensureDir(assets)
	if (!skipClean) {
		for (const directory of jsonOnly ? [seeds] : [seeds, assets]) {
			await validateDirectory(directory)
			for (const entry of await readdir(directory, { withFileTypes: true })) {
				if (entry.isFile() && (directory === assets || entry.name.endsWith('.json'))) {
					await unlink(path.join(directory, entry.name))
				}
			}
		}
	}
	return { seeds, assets }
}

/**
 * Writes text or asset content after ensuring its parent directory exists.
 * @param filePath - Destination filename.
 * @param content - Serialized seeds or binary asset content.
 * @returns Resolves after the file is written.
 */
export async function outputFile(filePath: string, content: string | Uint8Array): Promise<void> {
	await ensureDir(path.dirname(filePath))
	const file = await open(
		filePath,
		constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	)
	try {
		const entry = await file.stat()
		if (!entry.isFile() || entry.nlink !== 1) {
			throw new Error(`Extraction output must be a regular file with one link: ${filePath}`)
		}
		await file.truncate(0)
		await file.writeFile(content)
	} finally {
		await file.close()
	}
}
