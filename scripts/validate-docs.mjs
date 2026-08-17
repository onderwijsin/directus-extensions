/**
 * Validates repository documentation coverage and structure.
 *
 * Every workspace package must have a package README, every publishable extension
 * must have a consumer skill and a correctly linked entry in the root README
 * package table, and every tracked Markdown document must have a coherent heading
 * structure. The script is intentionally dependency free so the documentation
 * workflow can invoke it directly with Node.js.
 *
 * Invoked by `node scripts/validate-docs.mjs` and `pnpm validate:docs`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageRoots = ['extensions', 'packages']

/**
 * Discovers workspace package manifests.
 *
 * @param {string} repositoryRoot - Repository root to inspect.
 * @returns {{ directory: string, relativeDirectory: string, manifest: Record<string, unknown> }[]} Workspace packages.
 */
function discoverPackages(repositoryRoot = root) {
	return packageRoots.flatMap((packageRoot) => {
		const packagesDirectory = join(repositoryRoot, packageRoot)
		if (!existsSync(packagesDirectory)) return []

		return readdirSync(packagesDirectory, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => {
				const directory = join(packagesDirectory, entry.name)
				const manifestPath = join(directory, 'package.json')
				if (!existsSync(manifestPath)) return []

				return [
					{
						directory,
						relativeDirectory: `${packageRoot}/${entry.name}`,
						manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
					},
				]
			})
			.flat()
	})
}

/**
 * Discovers extension manifests in the repository.
 *
 * @param {string} repositoryRoot - Repository root to inspect.
 * @returns {{ directory: string, manifest: Record<string, unknown> }[]} Extension packages.
 */
function discoverExtensions(repositoryRoot = root) {
	return discoverPackages(repositoryRoot)
		.filter(({ relativeDirectory }) => relativeDirectory.startsWith('extensions/'))
		.map(({ directory, manifest }) => ({ directory, manifest }))
}

/**
 * Extracts ATX headings while ignoring fenced code blocks.
 * @param {string} content - Markdown document contents.
 * @returns {{ depth: number, text: string, line: number }[]} Parsed headings.
 */
function parseHeadings(content) {
	const headings = []
	let fence

	for (const [index, line] of content.split('\n').entries()) {
		const fenceMatch = /^ {0,3}(`{3,}|~{3,})/u.exec(line)
		if (fenceMatch) {
			const marker = fenceMatch[1][0]
			if (!fence || fence.marker !== marker || fence.length <= fenceMatch[1].length) {
				fence = fence ? undefined : { marker, length: fenceMatch[1].length }
			}
			continue
		}
		if (fence) continue

		const headingMatch = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line)
		if (headingMatch) {
			headings.push({
				depth: headingMatch[1].length,
				text: headingMatch[2].trim(),
				line: index + 1,
			})
		}
	}

	return headings
}

/**
 * Parses the simple YAML front matter used by consumer skills.
 *
 * This validates the repository's required shape, not general YAML syntax. Full
 * front matter parsing is intentionally deferred to the syntax-validation layer.
 *
 * @param {string} content - Markdown document contents.
 * @returns {{ fields: Map<string, string>, error?: string }} Front matter fields or a structural error.
 */
function parseSkillFrontMatter(content) {
	const lines = content.split('\n')
	if (lines[0] !== '---') return { fields: new Map(), error: 'must start with YAML front matter' }

	const closingIndex = lines.slice(1).findIndex((line) => line === '---')
	if (closingIndex === -1) return { fields: new Map(), error: 'has unclosed YAML front matter' }

	const fields = new Map()
	for (const line of lines.slice(1, closingIndex + 1)) {
		if (line.trim() === '') continue
		const field = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u.exec(line)
		if (!field) return { fields, error: `has invalid front matter line: ${line}` }
		if (fields.has(field[1]))
			return { fields, error: `duplicates front matter field: ${field[1]}` }
		fields.set(field[1], field[2].trim())
	}

	return { fields }
}

/**
 * Validates heading structure for one Markdown document.
 * @param {string} path - Repository-relative document path.
 * @param {string} content - Markdown document contents.
 * @param {{ expectedTitle?: string, skillName?: string }} options - Document-specific rules.
 * @returns {string[]} Structural validation failures.
 */
function validateDocumentStructure(path, content, options = {}) {
	const failures = []
	const headings = parseHeadings(content)
	const h1Headings = headings.filter(({ depth }) => depth === 1)
	if (h1Headings.length !== 1) {
		failures.push(`${path}: must contain exactly one level-one heading`)
	}
	if (headings[0]?.depth !== 1) {
		failures.push(`${path}: first heading must be level one`)
	}

	for (let index = 1; index < headings.length; index += 1) {
		if (headings[index].depth > headings[index - 1].depth + 1) {
			failures.push(
				`${path}:${headings[index].line}: heading level skips from H${headings[index - 1].depth} to H${headings[index].depth}`,
			)
		}
	}

	const seenHeadings = new Set()
	for (const heading of headings) {
		const key = heading.text.toLowerCase()
		if (seenHeadings.has(key))
			failures.push(`${path}:${heading.line}: duplicate heading ${heading.text}`)
		seenHeadings.add(key)
	}

	if (
		options.expectedTitle &&
		!h1Headings[0]?.text.replaceAll('`', '').includes(options.expectedTitle)
	) {
		failures.push(`${path}: level-one heading must contain ${options.expectedTitle}`)
	}

	if (options.skillName) {
		const frontMatter = parseSkillFrontMatter(content)
		if (frontMatter.error) {
			failures.push(`${path}: ${frontMatter.error}`)
		} else {
			for (const field of ['name', 'description']) {
				if (!frontMatter.fields.get(field))
					failures.push(`${path}: front matter is missing ${field}`)
			}
			if (frontMatter.fields.get('name') !== options.skillName) {
				failures.push(`${path}: front matter name must be ${options.skillName}`)
			}
		}
	}

	return failures
}

/**
 * Recursively discovers Markdown documents under a directory.
 * @param {string} directory - Directory to inspect.
 * @returns {string[]} Markdown file paths.
 */
function discoverMarkdownFiles(directory) {
	if (!existsSync(directory)) return []
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) return discoverMarkdownFiles(path)
		return entry.isFile() && entry.name.endsWith('.md') ? [path] : []
	})
}

/**
 * Validates the consumer-facing documentation for one extension.
 *
 * @param {string} extensionName - Extension package name.
 * @param {Record<string, unknown>} manifest - Extension package manifest.
 * @param {string} readme - Package README contents.
 * @param {string} skill - Consumer skill contents.
 * @returns {string[]} Documentation failures.
 */
function validateExtensionDocumentation(extensionName, manifest, readme, skill) {
	return validateExtensionDocumentationWithPath(
		extensionName,
		manifest,
		readme,
		skill,
		extensionName,
	)
}

/**
 * Validates the consumer-facing documentation for one extension with structural context.
 * @param {string} extensionName - Extension package name.
 * @param {Record<string, unknown>} manifest - Extension package manifest.
 * @param {string} readme - Package README contents.
 * @param {string} skill - Consumer skill contents.
 * @param {string} skillName - Expected consumer skill name.
 * @param {{ validateReadme?: boolean }} options - Structural validation options.
 * @returns {string[]} Documentation failures.
 */
function validateExtensionDocumentationWithPath(
	extensionName,
	manifest,
	readme,
	skill,
	skillName,
	{ validateReadme = true } = {},
) {
	const failures = []
	const requiredContent = [
		['README', readme, new RegExp(extensionName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u')],
		['README', readme, /directus/iu],
		['README', readme, /install/iu],
		['skill', skill, /directus/iu],
		['skill', skill, /install|use/iu],
	]

	for (const [document, content, pattern] of requiredContent) {
		if (!pattern.test(content))
			failures.push(`${extensionName}: ${document} is missing ${pattern}`)
	}
	if (validateReadme) {
		failures.push(
			...validateDocumentStructure(`extensions/${skillName}/README.md`, readme, {
				expectedTitle: extensionName,
			}),
		)
	}
	failures.push(
		...validateDocumentStructure(`skills/${skillName}/SKILL.md`, skill, { skillName }),
	)

	const extension = manifest['directus:extension']
	const isNonSandboxedApiExtension =
		extension &&
		typeof extension === 'object' &&
		!Array.isArray(extension) &&
		['endpoint', 'hook', 'operation', 'bundle'].includes(extension.type) &&
		extension.sandbox?.enabled !== true
	if (isNonSandboxedApiExtension && !/non-sandbox|trusted/iu.test(`${readme}\n${skill}`)) {
		failures.push(
			`${extensionName}: non-sandboxed extensions must document the trusted runtime boundary`,
		)
	}

	return failures
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
	const packages = discoverPackages(repositoryRoot)

	failures.push(...validateDocumentStructure('README.md', readme))
	for (const path of discoverMarkdownFiles(join(repositoryRoot, 'docs'))) {
		const relativePath = path.slice(repositoryRoot.length + 1)
		failures.push(...validateDocumentStructure(relativePath, readFileSync(path, 'utf8')))
	}

	for (const line of readme.split('\n')) {
		const match = /\|\s+\[`([^`]+)`\]\(([^)]+)\)\s+\|/u.exec(line)
		if (match) {
			if (tableEntries.has(match[1]) && tableEntries.get(match[1]) !== match[2]) {
				failures.push(`README.md: conflicting package table entry ${match[1]}`)
			}
			tableEntries.set(match[1], match[2])
		}
	}
	for (const [packageName, packagePath] of tableEntries) {
		if (!existsSync(join(repositoryRoot, packagePath))) {
			failures.push(`${packageName}: root README link target does not exist: ${packagePath}`)
		}
	}

	for (const { relativeDirectory, manifest } of packages) {
		if (typeof manifest.name !== 'string') continue
		const packageReadmePath = `${relativeDirectory}/README.md`
		if (!existsSync(join(repositoryRoot, packageReadmePath))) {
			failures.push(`${manifest.name}: missing README`)
			continue
		}
		failures.push(
			...validateDocumentStructure(
				packageReadmePath,
				readFileSync(join(repositoryRoot, packageReadmePath), 'utf8'),
			),
		)
		if (manifest.private !== true && tableEntries.get(manifest.name) !== packageReadmePath) {
			failures.push(`${manifest.name}: missing or incorrect root README table entry`)
		}
	}

	for (const { directory, manifest } of discoverExtensions(repositoryRoot)) {
		if (manifest.private === true || typeof manifest.name !== 'string') continue

		const extensionName = directory.slice(join(repositoryRoot, 'extensions').length + 1)
		const expectedReadme = `extensions/${extensionName}/README.md`
		if (!existsSync(join(repositoryRoot, expectedReadme))) {
			continue
		}
		if (!existsSync(join(repositoryRoot, 'skills', extensionName, 'SKILL.md'))) {
			failures.push(`${manifest.name}: missing skills/${extensionName}/SKILL.md`)
			continue
		}

		const packageReadme = readFileSync(join(repositoryRoot, expectedReadme), 'utf8')
		const skill = readFileSync(
			join(repositoryRoot, 'skills', extensionName, 'SKILL.md'),
			'utf8',
		)
		failures.push(
			...validateExtensionDocumentationWithPath(
				manifest.name,
				manifest,
				packageReadme,
				skill,
				extensionName,
				{ validateReadme: false },
			),
		)
	}

	return failures
}

export {
	discoverExtensions,
	discoverPackages,
	parseHeadings,
	validateDocumentStructure,
	validateExtensionDocumentation,
}

const failures = validateDocumentation()
if (failures.length > 0) {
	console.error(failures.join('\n'))
	process.exit(1)
}

console.log('Extension README and consumer skill coverage is valid.')
