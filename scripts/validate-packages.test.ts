import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { errors, validateExtension, validateMetadata } from './validate-packages.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
	errors.length = 0
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	)
})

describe('package validation script', () => {
	it('accepts complete public extension metadata', async () => {
		const packageDirectory = await mkdtemp(join(tmpdir(), 'directus-extensions-package-test-'))
		temporaryDirectories.push(packageDirectory)
		await mkdir(join(packageDirectory, 'dist'), { recursive: true })
		await writeFile(join(packageDirectory, 'index.js'), '')
		await writeFile(join(packageDirectory, 'dist', 'index.js'), '')
		await writeFile(join(packageDirectory, 'README.md'), '')
		await writeFile(join(packageDirectory, 'CHANGELOG.md'), '')

		const manifest = {
			name: '@example/extension',
			version: '1.0.0',
			description: 'Example extension',
			license: 'MIT',
			author: {
				name: 'Onderwijs in',
				email: 'hallo@onderwijsin.nl',
				url: 'https://github.com/onderwijsin',
			},
			contributors: [{ name: 'Example contributor' }],
			keywords: ['directus', 'directus-extension'],
			files: ['dist'],
			type: 'module',
			main: './index.js',
			exports: { '.': './index.js' },
			publishConfig: { access: 'public' },
			engines: { node: '>=24.10.0' },
			repository: {
				type: 'git',
				url: 'https://github.com/example/repo',
				directory: 'extensions/example',
			},
			homepage: 'https://github.com/example/repo',
			bugs: { url: 'https://github.com/example/repo/issues' },
			icon: 'extension',
			'directus:extension': {
				type: 'endpoint',
				host: 'api',
				path: 'dist/index.js',
				source: 'dist/index.js',
			},
		}

		await validateMetadata(manifest.name, packageDirectory, manifest)
		await validateExtension(manifest.name, packageDirectory, manifest)
		expect(errors).toEqual([])
	})

	it('reports missing package requirements', async () => {
		const packageDirectory = await mkdtemp(join(tmpdir(), 'directus-extensions-package-test-'))
		temporaryDirectories.push(packageDirectory)

		await validateMetadata('@example/incomplete', packageDirectory, { type: 'module' })

		expect(errors).toContain('@example/incomplete: must declare name')
		expect(errors).toContain('@example/incomplete: files must include dist')
		expect(errors).toContain('@example/incomplete: is missing README.md')
		expect(errors).toContain(
			'@example/incomplete: ESM packages must expose main through exports at .',
		)
	})

	it('reports a package whose root export does not expose main', async () => {
		const packageDirectory = await mkdtemp(join(tmpdir(), 'directus-extensions-package-test-'))
		temporaryDirectories.push(packageDirectory)
		await mkdir(join(packageDirectory, 'dist'), { recursive: true })
		await writeFile(join(packageDirectory, 'index.js'), '')
		await writeFile(join(packageDirectory, 'other.js'), '')
		await writeFile(join(packageDirectory, 'README.md'), '')
		await writeFile(join(packageDirectory, 'CHANGELOG.md'), '')

		await validateMetadata('@example/mismatched-exports', packageDirectory, {
			name: '@example/mismatched-exports',
			version: '1.0.0',
			description: 'Example extension',
			license: 'MIT',
			author: {
				name: 'Onderwijs in',
				email: 'hallo@onderwijsin.nl',
				url: 'https://github.com/onderwijsin',
			},
			contributors: [{ name: 'Example contributor' }],
			keywords: ['directus', 'directus-extension'],
			files: ['dist'],
			type: 'module',
			main: './index.js',
			exports: { '.': './other.js' },
			publishConfig: { access: 'public' },
			engines: { node: '>=24.10.0' },
			repository: {
				type: 'git',
				url: 'https://github.com/example/repo',
				directory: 'extensions/example',
			},
			homepage: 'https://github.com/example/repo',
			bugs: { url: 'https://github.com/example/repo/issues' },
		})

		expect(errors).toContain(
			'@example/mismatched-exports: ESM packages must expose main through exports at .',
		)
	})
})
