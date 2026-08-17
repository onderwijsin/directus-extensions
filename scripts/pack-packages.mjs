/**
 * Packs every publishable workspace package into a single output directory.
 *
 * Invoked by `pnpm pack:packages` and CI to produce the archives consumed by
 * the clean E2E consumer setup. Pass an output directory as the first argument
 * to override the default `.artifacts/packages` location.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/**
 * Packs publishable workspace packages into one artifact directory.
 * @param {{root?: string, outputDirectory?: string, packageRoots?: string[], pack?: (packageDirectory: string, destination: string) => string}} options - Packing options.
 * @returns {Promise<string[]>} Archive paths returned by pnpm.
 */
export async function packPackages({
	root: workspaceRoot = root,
	outputDirectory = resolve(workspaceRoot, '.artifacts/packages'),
	packageRoots = ['extensions', 'packages'],
	pack = (packageDirectory, destination) =>
		execFileSync(
			'corepack',
			['pnpm', 'pack', '--pack-destination', destination, '--json', '--reporter', 'silent'],
			{ cwd: packageDirectory, encoding: 'utf8' },
		),
} = {}) {
	await mkdir(outputDirectory, { recursive: true })
	const archives = []

	for (const packageRoot of packageRoots) {
		const packageRootPath = resolve(workspaceRoot, packageRoot)
		for (const entry of await readdir(packageRootPath, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue

			const packageDirectory = resolve(packageRootPath, entry.name)
			let manifest
			try {
				// A directory is a package candidate only when it has a readable manifest.
				manifest = JSON.parse(
					await readFile(resolve(packageDirectory, 'package.json'), 'utf8'),
				)
			} catch {
				continue
			}
			if (manifest.private === true && manifest['directus:e2e'] !== true) continue

			const archive = JSON.parse(pack(packageDirectory, outputDirectory)).filename
			archives.push(archive)
			console.log(`Packed ${manifest.name}: ${archive}`)
		}
	}

	return archives
}

if (import.meta.main)
	await packPackages({
		outputDirectory: resolve(process.argv[2] ?? resolve(root, '.artifacts/packages')),
	})
