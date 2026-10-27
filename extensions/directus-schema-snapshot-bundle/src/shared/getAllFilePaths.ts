import { readdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * Recursively retrieves all file paths within a specified directory.
 *
 * @param {string} dir - The directory path from which to start retrieving file paths.
 * @returns {Promise<string[]>} A promise that resolves to an array of file paths.
 */
export async function getAllFilePaths(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true })

	const promises = entries.map(async (entry) => {
		const fullPath = path.join(dir, entry.name)

		if (entry.isDirectory()) {
			return getAllFilePaths(fullPath)
		}

		return fullPath
	})

	const files = await Promise.all(promises)

	return files.flat()
}
