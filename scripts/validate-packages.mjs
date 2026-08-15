import { execFileSync } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageRoots = ['extensions', 'packages']
const errors = []

/**
 * Reads a package manifest from the workspace.
 * @param packageDirectory - Workspace package directory.
 * @returns Parsed package manifest.
 */
async function readManifest(packageDirectory) {
	const manifestPath = resolve(packageDirectory, 'package.json')
	return JSON.parse(await readFile(manifestPath, 'utf8'))
}

/**
 * Records a package validation error.
 * @param packageName - Package name.
 * @param message - Validation failure description.
 * @returns Nothing.
 */
function report(packageName, message) {
	errors.push(`${packageName}: ${message}`)
}

/**
 * Checks that a package file or directory exists.
 * @param packageName - Package name.
 * @param packageDirectory - Workspace package directory.
 * @param relativePath - Path relative to the package directory.
 * @returns A promise that resolves after validation completes.
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
 * @param packageName - Package name.
 * @param packageDirectory - Workspace package directory.
 * @param manifest - Package manifest.
 * @returns A promise that resolves after validation completes.
 */
async function validateMetadata(packageName, packageDirectory, manifest) {
	const requiredStrings = ['name', 'version', 'description', 'license']
	for (const field of requiredStrings) {
		if (typeof manifest[field] !== 'string' || manifest[field].length === 0) {
			report(packageName, `must declare ${field}`)
		}
	}

	if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) {
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
	if (Object.hasOwn(runtimeDependencies, '@workspace/test-utils')) {
		report(packageName, 'must not depend on private @workspace/test-utils at runtime')
	}

	for (const requiredFile of ['README.md', 'CHANGELOG.md', 'dist']) {
		await requirePath(packageName, packageDirectory, requiredFile)
	}
}

/**
 * Checks Directus extension metadata.
 * @param packageName - Package name.
 * @param packageDirectory - Workspace extension directory.
 * @param manifest - Package manifest.
 * @returns A promise that resolves after validation completes.
 */
async function validateExtension(packageName, packageDirectory, manifest) {
	if (!Array.isArray(manifest.keywords) || !manifest.keywords.includes('directus-extension')) {
		report(packageName, 'must include the directus-extension keyword')
	}

	const extension = manifest['directus:extension']
	if (!extension || typeof extension !== 'object') {
		report(packageName, 'must declare directus:extension metadata')
		return
	}
	for (const field of ['type', 'path', 'source', 'host']) {
		if (typeof extension[field] !== 'string' || extension[field].length === 0) {
			report(packageName, `directus:extension.${field} is required`)
		}
	}
	if (typeof extension.path === 'string' && !extension.path.startsWith('dist/')) {
		report(packageName, 'directus:extension.path must point into dist')
	}
	for (const field of ['path', 'source']) {
		if (typeof extension[field] === 'string') {
			await requirePath(packageName, packageDirectory, extension[field])
		}
	}
}

/**
 * Validates a packed public package and its archive contents.
 * @param packageName - Package name.
 * @param manifest - Package manifest.
 * @param outputDirectory - Temporary package output directory.
 * @returns Nothing.
 */
function validatePackedPackage(packageName, manifest, outputDirectory) {
	let packOutput
	try {
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
async function main() {
	const outputDirectory = await mkdtemp(join(tmpdir(), 'directus-extensions-pack-'))
	try {
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
				if (manifest.private === true) continue
				const packageName = manifest.name ?? packageDirectory
				await validateMetadata(packageName, packageDirectory, manifest)
				if (packageRoot === 'extensions') {
					await validateExtension(packageName, packageDirectory, manifest)
				}
				validatePackedPackage(packageName, manifest, outputDirectory)
			}
		}
	} finally {
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

await main()
