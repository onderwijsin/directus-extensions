import type { SeederOptions } from '../env.schema'
import type { DataScope } from './config'

import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises'
import path from 'node:path'

/**
 * Checks every existing path component without following directory symlinks.
 * @param directory - Resolved output directory to inspect.
 * @returns Canonical path, including any not-yet-existing suffix.
 */
export async function validateDirectory(directory: string): Promise<string> {
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
	// Preserve validation of the configured root before preparing its system output.
	await validateDirectory(path.dirname(path.resolve(folders.seeds)))
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
				if (
					entry.isFile() &&
					(directory === assets ||
						(entry.name.endsWith('.json') && !entry.name.endsWith('.managed-ids.json')))
				) {
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

/**
 * Reads persisted history without following symlinks or accepting linked or special files.
 * @param filePath - Required manifest filename.
 * @returns UTF-8 content from a regular file with a single link.
 */
export async function readRegularFile(filePath: string): Promise<string> {
	await validateDirectory(path.resolve(path.dirname(filePath)))
	const file = await open(
		filePath,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	)
	try {
		const entry = await file.stat()
		if (!entry.isFile() || entry.nlink !== 1) {
			throw new Error(`Manifest input must be a regular file with one link: ${filePath}`)
		}
		return await file.readFile('utf8')
	} finally {
		await file.close()
	}
}

/**
 * Validates a destination before replacing it, permitting creation only when absent.
 * @param filePath - Manifest destination.
 * @returns Resolves when the destination is absent or a single-link regular file.
 */
async function validateReplacement(filePath: string): Promise<void> {
	try {
		const entry = await lstat(filePath)
		if (!entry.isFile() || entry.nlink !== 1) {
			throw new Error(`Extraction output must be a regular file with one link: ${filePath}`)
		}
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
		throw error
	}
}

/**
 * Writes history through a sibling temporary file so failures never truncate the destination.
 * @param filePath - Manifest destination.
 * @param content - Complete serialized history.
 * @returns Resolves after atomic replacement; removes temporary output on failure.
 */
export async function outputFileAtomic(filePath: string, content: string): Promise<void> {
	const directory = path.resolve(path.dirname(filePath))
	await ensureDir(directory)
	await validateReplacement(filePath)
	const temporary = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`)
	const file = await open(
		temporary,
		constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
	)
	try {
		try {
			await file.writeFile(content)
		} finally {
			await file.close()
		}
		await validateDirectory(directory)
		await validateReplacement(filePath)
		await rename(temporary, filePath)
	} catch (error) {
		try {
			await unlink(temporary)
		} catch (cleanupError) {
			if (
				!(
					cleanupError instanceof Error &&
					'code' in cleanupError &&
					cleanupError.code === 'ENOENT'
				)
			) {
				throw new AggregateError(
					[error, cleanupError],
					`Failed to clean manifest temporary file: ${temporary}`,
				)
			}
		}
		throw error
	}
}

/**
 * Derives scope output from the seed root and preserves the independent asset path.
 * @param options - Validated startup options.
 * @param scope - Selected scope; existing callers retain system output.
 * @returns Scoped seed and independent asset paths.
 */
export function getFolderPaths(options: SeederOptions, scope: DataScope = 'system') {
	return {
		seedsFolder: path.join(options.SEEDER_SEEDS_DIR, scope),
		assetsFolder: options.SEEDER_ASSETS_DIR,
	}
}
