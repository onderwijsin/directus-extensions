import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { errors, inspectPackedArchive } from './validate-packages.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
	errors.length = 0
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	)
})

/**
 * Creates a package archive with a generated JavaScript entry.
 * @param {string} javascript - JavaScript source to include in the packed archive.
 * @returns {Promise<{archive: string, directory: string}>} Archive and fixture directory paths.
 */
async function createArchive(javascript: string) {
	const directory = await mkdtemp(join(tmpdir(), 'directus-extensions-package-inspection-test-'))
	temporaryDirectories.push(directory)
	const packageDirectory = join(directory, 'package')
	const archive = join(directory, 'package.tgz')

	await mkdir(join(packageDirectory, 'dist'), { recursive: true })
	await Promise.all([
		writeFile(
			join(packageDirectory, 'package.json'),
			JSON.stringify({ name: '@example/large-package', version: '1.0.0' }),
		),
		writeFile(join(packageDirectory, 'README.md'), 'Example package'),
		writeFile(join(packageDirectory, 'CHANGELOG.md'), 'Example changelog'),
		writeFile(join(packageDirectory, 'dist', 'index.js'), javascript),
	])
	execFileSync('tar', ['-czf', archive, 'package'], { cwd: directory })

	return { archive, directory }
}

describe('packed package archive inspection', () => {
	it('validates JavaScript entries larger than the child-process output buffer', async () => {
		const { archive, directory } = await createArchive(
			`export const source = '${'x'.repeat(1_048_577)}'\n`,
		)

		await inspectPackedArchive(
			'@example/large-package',
			{ name: '@example/large-package', version: '1.0.0' },
			archive,
			directory,
		)

		expect(errors).toEqual([])
		expect((await readdir(directory)).sort()).toEqual(['package', 'package.tgz'])
	})

	it('reports private workspace dependencies in JavaScript entries larger than the buffer', async () => {
		const { archive, directory } = await createArchive(
			`export const source = '${'x'.repeat(1_048_577)}'\nimport '@workspace/test-utils'\n`,
		)

		await inspectPackedArchive(
			'@example/large-package',
			{ name: '@example/large-package', version: '1.0.0' },
			archive,
			directory,
		)

		expect(errors).toEqual([
			'@example/large-package: packed output dist/index.js leaks @workspace/test-utils',
		])
		expect((await readdir(directory)).sort()).toEqual(['package', 'package.tgz'])
	})

	it('propagates corrupt archive failures and removes temporary inspection output', async () => {
		const directory = await mkdtemp(
			join(tmpdir(), 'directus-extensions-package-inspection-test-'),
		)
		temporaryDirectories.push(directory)
		const archive = join(directory, 'package.tgz')
		await writeFile(archive, 'not a tarball')

		await expect(
			inspectPackedArchive(
				'@example/corrupt-package',
				{ name: '@example/corrupt-package', version: '1.0.0' },
				archive,
				directory,
			),
		).rejects.toThrow()

		expect(await readdir(directory)).toEqual(['package.tgz'])
	})
})
