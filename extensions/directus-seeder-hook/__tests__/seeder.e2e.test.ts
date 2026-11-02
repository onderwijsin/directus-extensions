import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createTranslation,
	deleteTranslation,
	readTranslation,
} from '@workspace/test-utils/commands'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN
const composeProject = process.env.DIRECTUS_E2E_COMPOSE_PROJECT
const composeFiles = z
	.array(z.string())
	.parse(JSON.parse(process.env.DIRECTUS_E2E_COMPOSE_FILES ?? 'null'))
if (!baseUrl || !token || !composeProject)
	throw new Error('The Directus E2E environment was not initialized')

const client = createDirectusE2EClient({ baseUrl, token, composeFiles, composeProject })
const execute = promisify(execFile)
const composeArguments = [
	'compose',
	...composeFiles.flatMap((filename) => ['-f', filename]),
	'-p',
	composeProject,
	'exec',
	'-T',
]

/**
 * Runs the installed seeder in a fresh host CLI process with isolated output paths.
 * @param environment - Per-process Directus environment values.
 * @param args - Arguments after the seed namespace.
 * @returns Captured CLI output after a successful exit.
 */
async function seed(environment: Record<string, string>, ...args: string[]) {
	try {
		return await execute(
			'docker',
			[
				...composeArguments,
				...Object.entries(environment).flatMap(([name, value]) => [
					'-e',
					`${name}=${value}`,
				]),
				'directus',
				'node',
				'/directus/cli.js',
				'seed',
				...args,
			],
			{ timeout: 60_000, maxBuffer: 2 * 1024 * 1024 },
		)
	} catch (error) {
		if (error instanceof Error && 'stdout' in error && typeof error.stdout === 'string')
			error.message += `\n${error.stdout}`
		throw error
	}
}

describe('installed seeder CLI', () => {
	it('honors enablement and exposes extraction help only in development', async () => {
		const development = await seed({ DEPLOYMENT_ENV: 'development' }, '--help')
		expect(development.stdout).toContain('system')
		expect(development.stdout).toContain('extract')
		const production = await seed({ DEPLOYMENT_ENV: 'production' }, '--help')
		expect(production.stdout).toContain('system')
		expect(production.stdout).not.toContain('extract [options]')
		await expect(
			seed({ DEPLOYMENT_ENV: 'development', SEEDER_ENABLED: 'false' }, 'system'),
		).rejects.toThrow("unknown command 'seed'")
	})

	it('preserves an owned translation in insert-missing and updates it idempotently in insert-update', async () => {
		const id = randomUUID()
		const directory = `/tmp/seeder-e2e-${randomUUID()}`
		const fixture = { id, key: `seeder_e2e_${id}`, language: 'nl-NL', value: 'seeded' }
		const environment = {
			DEPLOYMENT_ENV: 'production',
			SEEDER_SEEDS_FOLDER: directory,
			SEEDER_ASSETS_DIR: `${directory}/assets`,
		}
		let created = false
		try {
			await client.request(createTranslation({ ...fixture, value: 'original' }))
			created = true
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'const fs = require("node:fs"); fs.mkdirSync(process.argv[1], { recursive: true }); fs.writeFileSync(`${process.argv[1]}/directus_translations.json`, process.argv[2])',
				directory,
				JSON.stringify([fixture]),
			])
			await seed(environment, 'system', '--include', 'directus_translations')
			expect(await client.request(readTranslation(id))).toMatchObject({
				...fixture,
				value: 'original',
			})
			await seed(
				environment,
				'system',
				'--mode',
				'insert-update',
				'--include',
				'directus_translations',
				'--force',
			)
			expect(await client.request(readTranslation(id))).toMatchObject(fixture)
			await seed(
				environment,
				'system',
				'--mode',
				'insert-update',
				'--include',
				'directus_translations',
				'--yes',
			)
			expect(await client.request(readTranslation(id))).toMatchObject(fixture)
		} finally {
			try {
				if (created) await client.request(deleteTranslation(id))
			} finally {
				await execute('docker', [
					...composeArguments,
					'directus',
					'node',
					'-e',
					'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })',
					directory,
				])
			}
		}
	})
})
