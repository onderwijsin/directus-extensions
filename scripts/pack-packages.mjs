import { execFileSync } from 'node:child_process'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outputDirectory = resolve(process.argv[2] ?? resolve(root, '.artifacts/packages'))
const packageRoots = ['extensions', 'packages']

await mkdir(outputDirectory, { recursive: true })

for (const packageRoot of packageRoots) {
	const packageRootPath = resolve(root, packageRoot)
	for (const entry of await readdir(packageRootPath, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue

		const packageDirectory = resolve(packageRootPath, entry.name)
		let manifest
		try {
			manifest = JSON.parse(await readFile(resolve(packageDirectory, 'package.json'), 'utf8'))
		} catch {
			continue
		}
		if (manifest.private === true) continue

		const output = execFileSync(
			'corepack',
			[
				'pnpm',
				'pack',
				'--pack-destination',
				outputDirectory,
				'--json',
				'--reporter',
				'silent',
			],
			{ cwd: packageDirectory, encoding: 'utf8' },
		)
		const archive = JSON.parse(output).filename
		console.log(`Packed ${manifest.name}: ${archive}`)
	}
}
