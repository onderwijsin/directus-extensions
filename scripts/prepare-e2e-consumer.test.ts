import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepareE2EConsumer } from './prepare-e2e-consumer.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	)
})

describe('E2E consumer preparation script', () => {
	it('creates the consumer manifest and copies packed extensions', async () => {
		const root = await mkdtemp(join(tmpdir(), 'directus-extensions-consumer-test-'))
		temporaryDirectories.push(root)
		const artifactDirectory = join(root, 'artifacts')
		const consumerDirectory = join(root, 'consumer')
		const packageName = '@example/extension'
		const archivePath = join(artifactDirectory, 'extension.tgz')
		const installedPackage = join(consumerDirectory, 'node_modules', packageName)
		await mkdir(artifactDirectory, { recursive: true })
		await writeFile(archivePath, 'archive')
		await mkdir(join(installedPackage, 'dist'), { recursive: true })
		await writeFile(join(installedPackage, 'dist', 'index.js'), 'export default {}')
		await writeFile(
			join(installedPackage, 'package.json'),
			JSON.stringify({ name: packageName, 'directus:extension': { type: 'endpoint' } }),
		)

		const execute = (_command: string, args: string[]) => {
			if (args[0] === '-xOf') {
				return JSON.stringify({
					name: packageName,
					'directus:extension': { type: 'endpoint' },
				})
			}
			return ''
		}

		const prepared = await prepareE2EConsumer({
			artifactDirectory,
			consumerDirectory,
			execute,
		})

		const packageJson = JSON.parse(
			await readFile(join(consumerDirectory, 'package.json'), 'utf8'),
		)
		expect(packageJson.dependencies[packageName]).toBe(`file:${archivePath}`)
		expect(prepared).toEqual([join(consumerDirectory, 'extensions', 'extension')])
		const [preparedExtension] = prepared
		expect(preparedExtension).toBeDefined()
		if (!preparedExtension) throw new Error('Expected one prepared extension')
		expect(await readFile(join(preparedExtension, 'dist', 'index.js'), 'utf8')).toBe(
			'export default {}',
		)
	})
})
