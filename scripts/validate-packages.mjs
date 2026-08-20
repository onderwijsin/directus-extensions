/**
 * Validates metadata, required files, and packed contents for public workspace packages.
 *
 * Invoked by `pnpm validate:packages` after the workspace build and during CI/release
 * validation. Each package is checked in place, packed into a temporary directory,
 * inspected as an archive, and then removed from the temporary workspace.
 */
import { execFileSync } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageRoots = ['extensions', 'packages']
export const errors = []

/**
 * @typedef {Object} PackageManifest
 * @property {unknown} [name] - Package name.
 * @property {unknown} [version] - Package version.
 * @property {unknown} [description] - Package description.
 * @property {unknown} [license] - Package license.
 * @property {unknown} [files] - Published file list.
 * @property {unknown} [main] - CommonJS entry point.
 * @property {unknown} [types] - TypeScript declaration entry point.
 * @property {{access?: unknown}|undefined} [publishConfig] - Publish settings.
 * @property {{node?: unknown}|undefined} [engines] - Runtime requirements.
 * @property {{type?: unknown, url?: unknown, directory?: unknown}|undefined} [repository] - Repository metadata.
 * @property {unknown} [homepage] - Package homepage.
 * @property {{url?: unknown}|undefined} [bugs] - Issue tracker metadata.
 * @property {Record<string, unknown>|undefined} [dependencies] - Runtime dependencies.
 * @property {Record<string, unknown>|undefined} [optionalDependencies] - Optional runtime dependencies.
 * @property {Record<string, unknown>|undefined} [peerDependencies] - Peer dependencies.
 * @property {unknown} [keywords] - npm keywords.
 * @property {unknown} [author] - npm author metadata.
 * @property {unknown} [contributors] - npm contributor metadata.
 * @property {unknown} [icon] - Directus extension icon.
 * @property {unknown} [private] - Whether the package is private.
 * @property {unknown} [directusExtension] - Directus extension metadata.
 */

/**
 * Reads a package manifest from the workspace.
 * @param {string} packageDirectory - Workspace package directory.
 * @returns {Promise<PackageManifest>} Parsed package manifest.
 */
export async function readManifest(packageDirectory) {
	const manifestPath = resolve(packageDirectory, 'package.json')
	/** @type {unknown} */
	const parsed = JSON.parse(await readFile(manifestPath, 'utf8'))
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`Invalid package manifest: ${manifestPath}`)
	}
	return parsed
}

/**
 * Records a package validation error.
 * @param {string} packageName - Package name.
 * @param {string} message - Validation failure description.
 * @returns {void} Nothing.
 */
function report(packageName, message) {
	errors.push(`${packageName}: ${message}`)
}

/**
 * Checks that a package file or directory exists.
 * @param {string} packageName - Package name.
 * @param {string} packageDirectory - Workspace package directory.
 * @param {string} relativePath - Path relative to the package directory.
 * @returns {Promise<void>} A promise that resolves after validation completes.
 */
async function requirePath(packageName, packageDirectory, relativePath) {
	try {
		await access(resolve(packageDirectory, relativePath))
	} catch {
		report(packageName, `is missing ${relativePath}`)
	}
}

/**
 * Checks common npm package metadata.
 * @param {string} packageName - Package name.
 * @param {string} packageDirectory - Workspace package directory.
 * @param {PackageManifest} manifest - Package manifest.
 * @returns {Promise<void>} A promise that resolves after validation completes.
 */
export async function validateMetadata(packageName, packageDirectory, manifest) {
	// Check fields that npm consumers and the repository release process require.
	const requiredStrings = ['name', 'version', 'description', 'license']
	for (const field of requiredStrings) {
		if (typeof manifest[field] !== 'string' || manifest[field].trim().length === 0) {
			report(packageName, `must declare ${field}`)
		}
	}

	const author = manifest.author
	if (
		!author ||
		typeof author !== 'object' ||
		Array.isArray(author) ||
		author.name !== 'Onderwijs in' ||
		author.email !== 'hallo@onderwijsin.nl' ||
		author.url !== 'https://github.com/onderwijsin'
	) {
		report(
			packageName,
			'author must be Onderwijs in with hallo@onderwijsin.nl and https://github.com/onderwijsin',
		)
	}

	if (
		!Array.isArray(manifest.contributors) ||
		!manifest.contributors.some(
			(contributor) =>
				contributor &&
				typeof contributor === 'object' &&
				!Array.isArray(contributor) &&
				typeof contributor.name === 'string' &&
				contributor.name.trim().length > 0,
		)
	) {
		report(packageName, 'must declare at least one contributor with a name')
	}

	if (!Array.isArray(manifest.keywords) || manifest.keywords.length === 0) {
		report(packageName, 'must declare at least one keyword')
	}

	if (!Array.isArray(manifest.files) || !manifest.files.some((file) => file === 'dist')) {
		report(packageName, 'files must include dist')
	}
	if (typeof manifest.main !== 'string' || manifest.main.length === 0) {
		report(packageName, 'must declare main')
	} else {
		await requirePath(packageName, packageDirectory, manifest.main.replace(/^\.\//u, ''))
	}
	if (manifest.types !== undefined) {
		if (typeof manifest.types !== 'string' || manifest.types.length === 0) {
			report(packageName, 'types must be a non-empty string when declared')
		} else {
			await requirePath(packageName, packageDirectory, manifest.types.replace(/^\.\//u, ''))
		}
	}
	if (manifest.publishConfig?.access !== 'public') {
		report(packageName, 'publishConfig.access must be public')
	}
	if (manifest.engines?.node !== '>=24.10.0') {
		report(packageName, 'engines.node must be >=24.10.0')
	}

	const repository = manifest.repository
	if (
		repository?.type !== 'git' ||
		typeof repository.url !== 'string' ||
		typeof repository.directory !== 'string'
	) {
		report(packageName, 'must declare complete git repository metadata')
	}
	if (typeof manifest.homepage !== 'string' || typeof manifest.bugs?.url !== 'string') {
		report(packageName, 'must declare homepage and bugs.url metadata')
	}
	const runtimeDependencies = {
		...manifest.dependencies,
		...manifest.optionalDependencies,
		...manifest.peerDependencies,
	}
	// Published packages must not accidentally pull the private test utility into production.
	if (Object.hasOwn(runtimeDependencies, '@workspace/test-utils')) {
		report(packageName, 'must not depend on private @workspace/test-utils at runtime')
	}

	for (const requiredFile of ['README.md', 'CHANGELOG.md', 'dist']) {
		await requirePath(packageName, packageDirectory, requiredFile)
	}
}

/**
 * Checks Directus extension metadata.
 * @param {string} packageName - Package name.
 * @param {string} packageDirectory - Workspace extension directory.
 * @param {PackageManifest} manifest - Package manifest.
 * @returns {Promise<void>} A promise that resolves after validation completes.
 */
export async function validateExtension(packageName, packageDirectory, manifest) {
	if (typeof manifest.icon !== 'string' || manifest.icon.length === 0) {
		report(packageName, 'must declare icon')
	}

	if (!Array.isArray(manifest.keywords) || !manifest.keywords.includes('directus')) {
		report(packageName, 'must include the directus keyword')
	}
	if (!Array.isArray(manifest.keywords) || !manifest.keywords.includes('directus-extension')) {
		report(packageName, 'must include the directus-extension keyword')
	}

	const extensionValue = manifest['directus:extension']
	if (!extensionValue || typeof extensionValue !== 'object' || Array.isArray(extensionValue)) {
		report(packageName, 'must declare directus:extension metadata')
		return
	}
	const extension = /** @type {Record<string, unknown>} */ (extensionValue)
	for (const field of ['type', 'host']) {
		if (typeof extension[field] !== 'string' || extension[field].length === 0) {
			report(packageName, `directus:extension.${field} is required`)
		}
	}

	if (extension.type === 'bundle') {
		const bundlePath = extension.path
		if (!bundlePath || typeof bundlePath !== 'object' || Array.isArray(bundlePath)) {
			report(packageName, 'directus:extension.path must declare bundle app and api paths')
		} else {
			for (const field of ['app', 'api']) {
				const path = bundlePath[field]
				if (typeof path !== 'string' || !path.startsWith('dist/')) {
					report(packageName, `directus:extension.path.${field} must point into dist`)
				} else {
					await requirePath(packageName, packageDirectory, path)
				}
			}
		}
		if (!Array.isArray(extension.entries) || extension.entries.length === 0) {
			report(packageName, 'directus:extension.entries must declare bundle entries')
		} else {
			for (const [index, entryValue] of extension.entries.entries()) {
				if (!entryValue || typeof entryValue !== 'object' || Array.isArray(entryValue)) {
					report(packageName, `directus:extension.entries[${index}] must be an object`)
					continue
				}
				const entry = /** @type {Record<string, unknown>} */ (entryValue)
				for (const field of ['name', 'type']) {
					if (typeof entry[field] !== 'string' || entry[field].length === 0) {
						report(
							packageName,
							`directus:extension.entries[${index}].${field} is required`,
						)
					}
				}
				if (typeof entry.source === 'string') {
					await requirePath(packageName, packageDirectory, entry.source)
				} else if (
					entry.source &&
					typeof entry.source === 'object' &&
					!Array.isArray(entry.source)
				) {
					const source = /** @type {Record<string, unknown>} */ (entry.source)
					for (const field of ['app', 'api']) {
						if (typeof source[field] !== 'string' || source[field].length === 0) {
							report(
								packageName,
								`directus:extension.entries[${index}].source.${field} is required`,
							)
						} else {
							await requirePath(packageName, packageDirectory, source[field])
						}
					}
				} else {
					report(packageName, `directus:extension.entries[${index}].source is required`)
				}
			}
		}
		if (
			!Array.isArray(manifest.keywords) ||
			!manifest.keywords.includes('directus-extension-bundle')
		) {
			report(
				packageName,
				'bundle extensions must include the directus-extension-bundle keyword',
			)
		}
		return
	}

	for (const field of ['path', 'source']) {
		if (typeof extension[field] !== 'string' || extension[field].length === 0) {
			report(packageName, `directus:extension.${field} is required`)
		} else {
			if (field === 'path' && !extension[field].startsWith('dist/')) {
				report(packageName, 'directus:extension.path must point into dist')
			}
			await requirePath(packageName, packageDirectory, extension[field])
		}
	}
}

/**
 * Validates a packed public package and its archive contents.
 * @param {string} packageName - Package name.
 * @param {PackageManifest} manifest - Package manifest.
 * @param {string} outputDirectory - Temporary package output directory.
 * @returns {void} Nothing.
 */
export function validatePackedPackage(packageName, manifest, outputDirectory) {
	let packOutput
	try {
		// Pack from the workspace root so the archive is built using the same filter as release CI.
		packOutput = execFileSync(
			'corepack',
			[
				'pnpm',
				'--filter',
				packageName,
				'pack',
				'--pack-destination',
				outputDirectory,
				'--json',
			],
			{ cwd: root, encoding: 'utf8' },
		)
	} catch (error) {
		report(packageName, `pnpm pack failed: ${error.message}`)
		return
	}

	let archive
	try {
		const jsonStart = packOutput.indexOf('{')
		if (jsonStart === -1) throw new Error('pnpm pack JSON output was not found')
		archive = JSON.parse(packOutput.slice(jsonStart)).filename
	} catch {
		report(packageName, 'pnpm pack did not return a tarball filename')
		return
	}

	try {
		// Inspect the archive directly: this catches publish-time omissions hidden by the workspace.
		const packageJson = JSON.parse(
			execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }),
		)
		if (packageJson.name !== manifest.name || packageJson.version !== manifest.version) {
			report(packageName, 'packed package metadata does not match the workspace manifest')
		}
		if (packageJson.private === true) report(packageName, 'packed package must not be private')

		const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
		const entries = files.split('\n').filter(Boolean)
		if (!entries.some((file) => file.startsWith('package/dist/'))) {
			report(packageName, 'packed package is missing dist output')
		}
		for (const requiredFile of ['package/README.md', 'package/CHANGELOG.md']) {
			if (!entries.includes(requiredFile))
				report(packageName, `packed package is missing ${requiredFile}`)
		}
		for (const forbidden of ['package/src/', 'package/__tests__/', 'package/.env']) {
			if (entries.some((file) => file.startsWith(forbidden))) {
				report(packageName, `packed package contains forbidden ${forbidden}`)
			}
		}
		for (const file of entries.filter((entry) =>
			/^package\/dist\/.*\.(?:c|m)?js$/u.test(entry),
		)) {
			// Generated JavaScript must not contain a private workspace dependency reference.
			const output = execFileSync('tar', ['-xOf', archive, file], { encoding: 'utf8' })
			if (output.includes('@workspace/test-utils')) {
				report(
					packageName,
					`packed output ${file.slice('package/'.length)} leaks @workspace/test-utils`,
				)
			}
		}

		execFileSync('corepack', ['pnpm', 'exec', 'publint', '--strict', archive], {
			cwd: root,
			stdio: 'inherit',
		})
	} catch (error) {
		report(packageName, `packed package validation failed: ${error.message}`)
	}
}

/**
 * Validates all publishable workspace packages.
 * @returns A promise that resolves after validation completes.
 */
export async function main() {
	errors.length = 0
	const outputDirectory = await mkdtemp(join(tmpdir(), 'directus-extensions-pack-'))
	try {
		// Validate every public package under both workspace roots using one temporary archive directory.
		for (const packageRoot of packageRoots) {
			const directory = resolve(root, packageRoot)
			for (const entry of await readdir(directory, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue
				const packageDirectory = resolve(directory, entry.name)
				const manifestPath = resolve(packageDirectory, 'package.json')
				try {
					await access(manifestPath)
				} catch {
					continue
				}

				const manifest = await readManifest(packageDirectory)
				const packageName = manifest.name ?? packageDirectory
				if (packageRoot === 'extensions') {
					await validateExtension(packageName, packageDirectory, manifest)
				}
				if (manifest.private === true) continue
				await validateMetadata(packageName, packageDirectory, manifest)
				validatePackedPackage(packageName, manifest, outputDirectory)
			}
		}
	} finally {
		// Archives are validation intermediates and must not remain in the repository or temp workspace.
		await rm(outputDirectory, { force: true, recursive: true })
	}

	if (errors.length > 0) {
		console.error('Package validation failed:')
		for (const error of errors) console.error(`- ${error}`)
		process.exitCode = 1
		return
	}

	console.log('All publishable packages passed metadata and packed-artifact validation.')
}

if (import.meta.main) await main()
