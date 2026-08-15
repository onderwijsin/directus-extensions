import { execFileSync } from 'node:child_process'
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const [artifactDirectoryArgument, consumerDirectoryArgument] = process.argv.slice(2)
if (!artifactDirectoryArgument || !consumerDirectoryArgument) {
	throw new Error('Usage: pnpm prepare:e2e-consumer <artifact-directory> <consumer-directory>')
}

const artifactDirectory = resolve(artifactDirectoryArgument)
const consumerDirectory = resolve(consumerDirectoryArgument)
const packages = [
	{ name: '@onderwijsin/directus-extension-sample-hook', directory: 'sample-hook' },
	{ name: '@onderwijsin/directus-extension-utils' },
]

const archives = await readdir(artifactDirectory)
const dependencies = {}
for (const { name: packageName } of packages) {
	const archive = archives.find((file) =>
		file.includes(packageName.replaceAll('/', '-').replace('@', '')),
	)
	if (!archive) throw new Error(`Packed artifact not found for ${packageName}`)
	dependencies[packageName] = `file:${join(artifactDirectory, archive)}`
}

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
execFileSync('corepack', ['pnpm', 'install', '--ignore-scripts'], {
	cwd: consumerDirectory,
	stdio: 'inherit',
})

const extensionPackage = packages.find(
	({ name }) => name === '@onderwijsin/directus-extension-sample-hook',
)
const installedExtension = join(
	consumerDirectory,
	'node_modules/@onderwijsin/directus-extension-sample-hook',
)
const extensionDirectory = join(consumerDirectory, 'extensions', extensionPackage.directory)
await mkdir(extensionDirectory, { recursive: true })
await cp(join(installedExtension, 'dist'), join(extensionDirectory, 'dist'), { recursive: true })
await cp(join(installedExtension, 'package.json'), join(extensionDirectory, 'package.json'))
console.log(`Prepared packed Directus extension at ${extensionDirectory}`)
