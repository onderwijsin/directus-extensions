import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createCollection,
	customEndpoint,
	deleteCollection,
	deleteField,
	readFieldsByCollection,
} from '@workspace/test-utils/commands'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN
const composeProject = process.env.DIRECTUS_E2E_COMPOSE_PROJECT
const composeFiles = z
	.array(z.string())
	.parse(JSON.parse(process.env.DIRECTUS_E2E_COMPOSE_FILES ?? 'null'))
if (!baseUrl || !token || !composeProject) {
	throw new Error('The Directus E2E environment was not initialized')
}

const client = createDirectusE2EClient({ baseUrl, token, composeFiles, composeProject })
const execute = promisify(execFile)
const composeArguments = [
	'compose',
	...composeFiles.flatMap((file) => ['-f', file]),
	'-p',
	composeProject,
	'exec',
	'-T',
	'directus',
]

/**
 * Runs the installed host CLI against the disposable Directus database.
 * @param arguments_ - Arguments following the schema-split command.
 * @returns The CLI output after a successful process exit.
 */
async function schemaSplit(...arguments_: string[]) {
	try {
		return await execute(
			'docker',
			[...composeArguments, 'node', '/directus/cli.js', 'schema-split', ...arguments_],
			{
				timeout: 60_000,
				maxBuffer: 2 * 1024 * 1024,
			},
		)
	} catch (error) {
		if (error instanceof Error && 'stdout' in error && typeof error.stdout === 'string') {
			error.message += `\n${error.stdout}`
		}
		throw error
	}
}

describe('packed schema snapshot CLI', () => {
	it('snapshots and restores a field through the host SchemaService, then applies idempotently', async () => {
		const collection = 'schema_snapshot_e2e'
		const directory = `/tmp/schema-snapshot-e2e-${randomUUID()}`
		let created = false
		try {
			await client.request(
				createCollection({ collection, schema: { name: collection }, meta: {} }),
			)
			created = true
			await client.request(
				customEndpoint({
					path: `/fields/${collection}`,
					method: 'POST',
					body: JSON.stringify({
						field: 'title',
						type: 'string',
						meta: { interface: 'input' },
					}),
				}),
			)
			await schemaSplit('snapshot', '-o', directory)
			await client.request(deleteField(collection, 'title'))
			await schemaSplit('apply', directory)
			expect(await client.request(readFieldsByCollection(collection))).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ field: 'title', type: 'string' }),
				]),
			)
			const repeated = await schemaSplit('apply', directory)
			expect(repeated.stdout).toContain('schema already up to date')
		} finally {
			await execute('docker', [
				...composeArguments,
				'node',
				'-e',
				'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })',
				directory,
			])
			if (created) await client.request(deleteCollection(collection))
		}
	})

	it('migrates native YAML and reports a missing snapshot as a failed command', async () => {
		const directory = `/tmp/schema-snapshot-e2e-${randomUUID()}`
		try {
			await execute('docker', [
				...composeArguments,
				'node',
				'-e',
				'require("node:fs").mkdirSync(process.argv[1], { recursive: true })',
				directory,
			])
			await execute(
				'docker',
				[
					...composeArguments,
					'node',
					'/directus/cli.js',
					'schema',
					'snapshot',
					`${directory}/native.yml`,
					'--yes',
				],
				{ timeout: 60_000 },
			)
			await schemaSplit(
				'migrate',
				'-i',
				`${directory}/native.yml`,
				'-o',
				`${directory}/migrated`,
			)
			await schemaSplit('apply', `${directory}/migrated`)
			await expect(schemaSplit('apply', `${directory}/missing`)).rejects.toMatchObject({
				code: 1,
			})
		} finally {
			await execute('docker', [
				...composeArguments,
				'node',
				'-e',
				'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })',
				directory,
			])
		}
	})
})
