/**
 * Validates extension documentation coverage.
 *
 * Every publishable extension must have a consumer skill and a correctly linked
 * entry in the root README package table. The script is intentionally dependency
 * free so the documentation workflow can invoke it directly with Node.js.
 *
 * Invoked by `node scripts/validate-docs.mjs` and `pnpm validate:docs`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/**
 * Discovers extension manifests in the repository.
 *
 * @param {string} repositoryRoot - Repository root to inspect.
 * @returns {{ directory: string, manifest: Record<string, unknown> }[]} Extension packages.
 */
function discoverExtensions(repositoryRoot = root) {
	const extensionsDirectory = join(repositoryRoot, 'extensions')
	if (!existsSync(extensionsDirectory)) return []

	return readdirSync(extensionsDirectory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(extensionsDirectory, entry.name))
		.flatMap((directory) => {
			const manifestPath = join(directory, 'package.json')
			if (!existsSync(manifestPath)) return []

			return [{ directory, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) }]
		})
}

/**
 * Validates the root README and consumer skill for every publishable extension.
 *
 * @param {string} repositoryRoot - Repository root to inspect.
 * @returns {string[]} Human-readable validation failures.
 */
export function validateDocumentation(repositoryRoot = root) {
	const failures = []
	const readme = readFileSync(join(repositoryRoot, 'README.md'), 'utf8')
	const tableEntries = new Map()

	for (const line of readme.split('\n')) {
		const match = /\|\s+\[`([^`]+)`\]\(([^)]+)\)\s+\|/u.exec(line)
		if (match) tableEntries.set(match[1], match[2])
	}

	for (const { directory, manifest } of discoverExtensions(repositoryRoot)) {
		if (manifest.private === true || typeof manifest.name !== 'string') continue

		const extensionName = directory.slice(join(repositoryRoot, 'extensions').length + 1)
		const expectedReadme = `extensions/${extensionName}/README.md`
		if (tableEntries.get(manifest.name) !== expectedReadme) {
			failures.push(`${manifest.name}: missing or incorrect root README table entry`)
		}
		if (!existsSync(join(repositoryRoot, expectedReadme))) {
			failures.push(`${manifest.name}: missing README`)
		}
		if (!existsSync(join(repositoryRoot, 'skills', extensionName, 'SKILL.md'))) {
			failures.push(`${manifest.name}: missing skills/${extensionName}/SKILL.md`)
		}
	}

	return failures
}

const failures = validateDocumentation()
if (failures.length > 0) {
	console.error(failures.join('\n'))
	process.exit(1)
}

console.log('Extension README and consumer skill coverage is valid.')
