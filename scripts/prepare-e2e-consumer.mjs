/**
 * Creates a clean consumer project from packed workspace artifacts.
 *
 * Invoked by `pnpm prepare:e2e-consumer <artifact-directory> <consumer-directory>`
 * in CI before `scripts/e2e.mjs`. It installs the selected archives and copies
 * the packaged extension into the consumer's Directus extensions directory.
 */
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const [artifactDirectoryArgument, consumerDirectoryArgument] = process.argv.slice(2)
if (!artifactDirectoryArgument || !consumerDirectoryArgument) {
	throw new Error('Usage: pnpm prepare:e2e-consumer <artifact-directory> <consumer-directory>')
}

const artifactDirectory = resolve(artifactDirectoryArgument)
const consumerDirectory = resolve(consumerDirectoryArgument)
const archives = await readdir(artifactDirectory)
const dependencies = {}
const packedPackages = []

for (const archive of archives.filter((file) => file.endsWith('.tgz'))) {
	const archivePath = join(artifactDirectory, archive)
	let manifest
	try {
		manifest = JSON.parse(
			execFileSync('tar', ['-xOf', archivePath, 'package/package.json'], {
				encoding: 'utf8',
			}),
		)
	} catch {
		continue
	}

	if (manifest.private === true || typeof manifest.name !== 'string') continue
	dependencies[manifest.name] = `file:${archivePath}`
	packedPackages.push({ archivePath, manifest })
}

if (packedPackages.length === 0)
	throw new Error(`No public package archives found in ${artifactDirectory}`)

await mkdir(consumerDirectory, { recursive: true })
await writeFile(
	join(consumerDirectory, 'package.json'),
	`${JSON.stringify(
		{
			private: true,
			type: 'module',
			dependencies,
		},
		null,
		2,
	)}\n`,
)
await writeFile(
	join(consumerDirectory, 'pnpm-workspace.yaml'),
	`overrides:\n  '@onderwijsin/directus-extension-utils': ${dependencies['@onderwijsin/directus-extension-utils']}\n`,
)

// Install the archives so the consumer validates published package contents, not workspace links.
execFileSync('corepack', ['pnpm', 'install', '--ignore-scripts'], {
	cwd: consumerDirectory,
	stdio: 'inherit',
})

const extensionPackages = packedPackages.filter(
	({ manifest }) =>
		manifest['directus:extension'] &&
		typeof manifest['directus:extension'] === 'object' &&
		!Array.isArray(manifest['directus:extension']),
)

for (const { manifest } of extensionPackages) {
	const packageDirectoryName = manifest.name.split('/').at(-1)
	if (!packageDirectoryName)
		throw new Error(`Could not derive extension directory for ${manifest.name}`)

	const installedExtension = join(consumerDirectory, 'node_modules', manifest.name)
	const extensionDirectory = join(consumerDirectory, 'extensions', packageDirectoryName)

	// Directus loads each extension from the consumer-local package metadata and dist output.
	await mkdir(extensionDirectory, { recursive: true })
	await cp(join(installedExtension, 'dist'), join(extensionDirectory, 'dist'), {
		recursive: true,
	})
	await cp(join(installedExtension, 'package.json'), join(extensionDirectory, 'package.json'))
	console.log(`Prepared packed Directus extension ${manifest.name} at ${extensionDirectory}`)
}

if (extensionPackages.length === 0) throw new Error('No packed Directus extensions were found')
