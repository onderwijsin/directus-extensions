import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { packPackages } from './pack-packages.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	)
})

describe('package packing script', () => {
	it('packs public and E2E packages while skipping private packages', async () => {
		const root = await mkdtemp(join(tmpdir(), 'directus-extensions-pack-test-'))
		temporaryDirectories.push(root)
		for (const packageName of ['public', 'private', 'e2e']) {
			await mkdir(join(root, 'extensions', packageName), { recursive: true })
		}
		await writeFile(
			join(root, 'extensions', 'public', 'package.json'),
			JSON.stringify({ name: '@example/public' }),
		)
		await writeFile(
			join(root, 'extensions', 'private', 'package.json'),
			JSON.stringify({ name: '@example/private', private: true }),
		)
		await writeFile(
			join(root, 'extensions', 'e2e', 'package.json'),
			JSON.stringify({ name: '@example/e2e', private: true, 'directus:e2e': true }),
		)

		const calls: string[] = []
		const archives = await packPackages({
			root,
			packageRoots: ['extensions'],
			outputDirectory: join(root, 'artifacts'),
			pack: (packageDirectory: string, destination: string) => {
				calls.push(`${packageDirectory}:${destination}`)
				return JSON.stringify({ filename: join(destination, `${calls.length}.tgz`) })
			},
		})

		expect(archives).toHaveLength(2)
		expect(calls).toHaveLength(2)
		expect(calls.join('\n')).not.toContain('/private:')
	})
})
