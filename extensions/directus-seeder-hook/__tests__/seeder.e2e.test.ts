import { execFile } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createPreset,
	createTranslation,
	deletePreset,
	deleteRole,
	deleteTranslation,
	readPresets,
	readRoles,
	readTranslation,
	readTranslations,
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
	it('inspects configuration without seed input and bypasses consumer files for defaults', async () => {
		const directory = `/tmp/seeder-config-e2e-${randomUUID()}`
		const environment = {
			LOG_LEVEL: 'silent',
			DEPLOYMENT_ENV: 'development',
			SEEDER_AUTO_EXTRACT: 'true',
			SEEDER_CONFIG_PATH: `${directory}/config.json`,
			SEEDER_SEEDS_DIR: `${directory}/missing-seeds`,
			SEEDER_MODE: 'insert-update',
		}
		try {
			const defaults = await seed(
				environment,
				'config',
				'--defaults',
				'--collection',
				'directus_roles',
			)
			expect(JSON.parse(defaults.stdout)).toMatchObject({
				system: {
					order: ['directus_roles'],
					collections: {
						directus_roles: {
							operationMode: 'insert-missing',
							fields: ['id', 'name', 'icon', 'description', 'parent'],
						},
					},
				},
			})
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'if (require("node:fs").existsSync(process.argv[1])) throw new Error("Inspection created its input directory")',
				directory,
			])
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'const fs = require("node:fs"); fs.mkdirSync(process.argv[1]); fs.writeFileSync(`${process.argv[1]}/config.json`, process.argv[2])',
				directory,
				JSON.stringify({
					$comment: 'Inspection fixture',
					system: {
						order: ['directus_roles'],
						collections: {
							directus_roles: { fields: ['id'], operationMode: 'full-idempotent' },
						},
					},
				}),
			])
			const effective = await seed(environment, 'config')
			expect(JSON.parse(effective.stdout)).toMatchObject({
				system: {
					collections: {
						directus_roles: {
							fields: ['id'],
							filter: null,
							operationMode: 'full-idempotent',
						},
						directus_presets: { operationMode: 'insert-update' },
					},
				},
			})
			const contents = await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'process.stdout.write(JSON.stringify(require("node:fs").readdirSync(process.argv[1])))',
				directory,
			])
			expect(JSON.parse(contents.stdout)).toEqual(['config.json'])
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
	})

	it('extracts and synchronizes the configured ID range while preserving outside presets', async () => {
		const min = randomInt(2_000_000, 3_000_000)
		const max = min + 3
		const ids = [min - 1, min, min + 1, min + 2, max]
		const directory = `/tmp/seeder-e2e-${randomUUID()}`
		const configPath = `${directory}/config.json`
		const environment = {
			DEPLOYMENT_ENV: 'development',
			SEEDER_CONFIG_PATH: configPath,
			SEEDER_SEEDS_DIR: `${directory}/seeds`,
			SEEDER_ASSETS_DIR: `${directory}/seeds/assets`,
			SEEDER_ENABLE_FULL_IDEMPOTENT: 'true',
		}
		try {
			for (const id of [min - 1, min, min + 1, max]) {
				await client.request(
					createPreset({
						id,
						collection: 'directus_roles',
						bookmark: id === min + 1 ? 'obsolete' : 'keep',
						user: null,
					}),
				)
			}
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'const fs = require("node:fs"); fs.mkdirSync(process.argv[1]); fs.writeFileSync(`${process.argv[1]}/config.json`, process.argv[2])',
				directory,
				JSON.stringify({
					system: {
						collections: {
							directus_presets: {
								operationMode: 'full-idempotent',
								management: { type: 'id-range', min, max },
								filter: {
									_and: [
										{ user: { _null: true } },
										{ bookmark: { _eq: 'keep' } },
									],
								},
							},
						},
					},
				}),
			])
			await seed(environment, 'extract', '--json-only', '--include', 'directus_presets')
			const extracted = await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))',
				`${directory}/seeds/directus_presets.json`,
			])
			const rows: unknown = JSON.parse(extracted.stdout)
			expect(rows).toEqual([expect.objectContaining({ id: min, bookmark: 'keep' })])
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'require("node:fs").writeFileSync(process.argv[1], process.argv[2])',
				`${directory}/seeds/directus_presets.json`,
				JSON.stringify([
					{ id: min, collection: 'directus_roles', bookmark: 'updated' },
					{ id: min + 2, collection: 'directus_roles', bookmark: 'created' },
				]),
			])
			// Global default remains insert-missing; collection-level full-idempotent drives import.
			await seed(environment, 'system', '--yes', '--include', 'directus_presets')
			await seed(environment, 'system', '--yes', '--include', 'directus_presets')
			const presets = await client.request(
				readPresets({
					filter: { id: { _in: ids } },
					sort: ['id'],
					fields: ['id', 'bookmark'],
				}),
			)
			expect(presets).toEqual([
				{ id: min - 1, bookmark: 'keep' },
				{ id: min, bookmark: 'updated' },
				{ id: min + 2, bookmark: 'created' },
				{ id: max, bookmark: 'keep' },
			])
		} finally {
			try {
				for (const preset of await client.request(
					readPresets({ filter: { id: { _in: ids } } }),
				)) {
					await client.request(deletePreset(preset.id))
				}
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

	it.each(['false', 'true'])(
		'exits one after a partial mutation failure with continue-on-error=%s',
		async (continueOnError) => {
			const roleId = randomUUID()
			const failedRoleId = randomUUID()
			const translation = {
				id: randomUUID(),
				key: `seeder_e2e_${roleId}`,
				language: 'nl-NL',
				value: 'after failed collection',
			}
			const directory = `/tmp/seeder-e2e-${randomUUID()}`
			try {
				await execute('docker', [
					...composeArguments,
					'directus',
					'node',
					'-e',
					'const fs = require("node:fs"); const [root, roles, translations] = process.argv.slice(1); fs.mkdirSync(root); fs.writeFileSync(`${root}/directus_roles.json`, roles); fs.writeFileSync(`${root}/directus_translations.json`, translations)',
					directory,
					JSON.stringify([
						{ id: roleId, name: 'Seeder partial import fixture' },
						{ id: failedRoleId, name: 'Invalid parent fixture', parent: randomUUID() },
					]),
					JSON.stringify([translation]),
				])
				await expect(
					seed(
						{
							SEEDER_SEEDS_DIR: directory,
							SEEDER_BATCH_SIZE: '1',
							SEEDER_CONTINUE_ON_ERROR: continueOnError,
						},
						'system',
					),
				).rejects.toMatchObject({
					code: 1,
					stdout: expect.stringMatching(
						/Error seeding collection directus_roles:.*[\s\S]*System data seeding failed/u,
					),
				})
				expect(
					await client.request(readRoles({ filter: { id: { _eq: roleId } } })),
				).toEqual([expect.objectContaining({ id: roleId })])
				expect(
					await client.request(readRoles({ filter: { id: { _eq: failedRoleId } } })),
				).toEqual([])
				expect(
					await client.request(
						readTranslations({ filter: { id: { _eq: translation.id } } }),
					),
				).toEqual(continueOnError === 'true' ? [expect.objectContaining(translation)] : [])
			} finally {
				try {
					const roles = await client.request(
						readRoles({ filter: { id: { _in: [roleId, failedRoleId] } } }),
					)
					for (const role of roles) await client.request(deleteRole(role.id))
					const translations = await client.request(
						readTranslations({ filter: { id: { _eq: translation.id } } }),
					)
					if (translations.length > 0)
						await client.request(deleteTranslation(translation.id))
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
		},
	)

	it.each(['syntax', 'non-array', 'read'])(
		'exits one on a later %s input error before creating an earlier role, despite continue-on-error',
		async (failure) => {
			const id = randomUUID()
			const directory = `/tmp/seeder-e2e-${randomUUID()}`
			const filename = `${directory}/directus_permissions.json`
			try {
				await execute('docker', [
					...composeArguments,
					'directus',
					'node',
					'-e',
					'const fs = require("node:fs"); const [root, id, failure] = process.argv.slice(1); fs.mkdirSync(root); fs.writeFileSync(`${root}/directus_roles.json`, JSON.stringify([{ id, name: "Seeder preflight fixture" }])); const filename = `${root}/directus_permissions.json`; if (failure === "read") fs.mkdirSync(filename); else fs.writeFileSync(filename, failure === "syntax" ? "{broken" : "{}")',
					directory,
					id,
					failure,
				])
				await expect(
					seed(
						{
							SEEDER_SEEDS_DIR: directory,
							SEEDER_CONTINUE_ON_ERROR: 'true',
						},
						'system',
						'--include',
						'directus_roles',
						'directus_permissions',
					),
				).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining(filename) })
				expect(await client.request(readRoles({ filter: { id: { _eq: id } } }))).toEqual([])
			} finally {
				try {
					const roles = await client.request(readRoles({ filter: { id: { _eq: id } } }))
					if (roles.length > 0) await client.request(deleteRole(id))
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
		},
	)

	it('honors enablement and exposes extraction help only in development', async () => {
		const development = await seed({ DEPLOYMENT_ENV: 'development' }, '--help')
		expect(development.stdout).toContain('system')
		expect(development.stdout).toContain('extract')
		const production = await seed({ DEPLOYMENT_ENV: 'production' }, '--help')
		expect(production.stdout).toContain('system')
		expect(production.stdout).not.toContain('extract [options]')
		await expect(
			seed(
				{ DEPLOYMENT_ENV: 'development', SEEDER_ENABLED: 'false', SEEDER_BATCH_SIZE: '0' },
				'system',
			),
		).rejects.toThrow("unknown command 'seed'")
	})

	it.each([
		{ mode: 'default', jsonOnly: 'false', flags: [], retainJson: false, retainAssets: false },
		{
			mode: 'skip-clean',
			jsonOnly: 'false',
			flags: ['--skip-clean'],
			retainJson: true,
			retainAssets: true,
		},
		{
			mode: 'json-only',
			jsonOnly: 'false',
			flags: ['--json-only'],
			retainJson: false,
			retainAssets: true,
		},
		{
			mode: 'assets override',
			jsonOnly: 'true',
			flags: ['--assets'],
			retainJson: false,
			retainAssets: false,
		},
	])(
		'applies $mode output cleanup through the installed command',
		async ({ jsonOnly, flags, retainJson, retainAssets }) => {
			const directory = `/tmp/seeder-e2e-${randomUUID()}`
			const seeds = `${directory}/seeds`
			const assets = `${seeds}/assets`
			try {
				await execute('docker', [
					...composeArguments,
					'directus',
					'node',
					'-e',
					'const fs = require("node:fs"); const root = process.argv[1]; fs.mkdirSync(`${root}/seeds/assets/nested`, { recursive: true }); for (const name of ["seeds/stale.json", "seeds/notes.txt", "seeds/assets/stale.bin", "seeds/assets/binary.json", "seeds/assets/nested/keep.bin", "outside.json"]) fs.writeFileSync(`${root}/${name}`, name)',
					directory,
				])
				await seed(
					{
						DEPLOYMENT_ENV: 'development',
						SEEDER_SEEDS_DIR: seeds,
						SEEDER_ASSETS_DIR: assets,
						SEEDER_JSON_ONLY: jsonOnly,
					},
					'extract',
					...flags,
					'--include',
					'directus_roles',
				)
				const { stdout } = await execute('docker', [
					...composeArguments,
					'directus',
					'node',
					'-e',
					'const fs = require("node:fs"); const root = process.argv[1]; process.stdout.write(JSON.stringify({ staleJson: fs.existsSync(`${root}/seeds/stale.json`), staleAsset: fs.existsSync(`${root}/seeds/assets/stale.bin`), jsonAsset: fs.existsSync(`${root}/seeds/assets/binary.json`), nested: fs.readFileSync(`${root}/seeds/assets/nested/keep.bin`, "utf8"), notes: fs.readFileSync(`${root}/seeds/notes.txt`, "utf8"), outside: fs.readFileSync(`${root}/outside.json`, "utf8"), outputIsArray: Array.isArray(JSON.parse(fs.readFileSync(`${root}/seeds/directus_roles.json`, "utf8"))) }))',
					directory,
				])
				const output: unknown = JSON.parse(stdout)
				expect(output).toEqual({
					staleJson: retainJson,
					staleAsset: retainAssets,
					jsonAsset: retainAssets,
					nested: 'seeds/assets/nested/keep.bin',
					notes: 'seeds/notes.txt',
					outside: 'outside.json',
					outputIsArray: true,
				})
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
		},
	)

	it('extracts valid JSON with each indentation setting and rejects an invalid setting', async () => {
		const id = randomUUID()
		const directory = `/tmp/seeder-e2e-${randomUUID()}`
		const fixture = { id, key: `seeder_e2e_${id}`, language: 'nl-NL', value: 'indented' }
		const environment = {
			DEPLOYMENT_ENV: 'development',
			SEEDER_SEEDS_DIR: directory,
			SEEDER_ASSETS_DIR: `${directory}/assets`,
		}
		let created = false
		try {
			await client.request(createTranslation(fixture))
			created = true
			for (const [style, width] of [
				['tab', '8'],
				['space', '2'],
				['space', '10'],
			]) {
				const indent = style === 'tab' ? '\t' : Number(width)
				const result = await seed(
					{
						...environment,
						SEEDER_JSON_INDENT: style ?? 'tab',
						SEEDER_JSON_INDENT_SIZE: width ?? '2',
						SEEDER_JSON_ONLY: 'true',
						SEEDER_INCLUDE: 'directus_translations,directus_roles',
					},
					'extract',
				)
				expect(result.stdout).not.toContain('Extracting asset files')
				const { stdout } = await execute('docker', [
					...composeArguments,
					'directus',
					'node',
					'-e',
					'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))',
					`${directory}/directus_translations.json`,
				])
				const records: unknown = JSON.parse(stdout)
				expect(records).toEqual(expect.arrayContaining([expect.objectContaining(fixture)]))
				expect(stdout).toBe(`${JSON.stringify(records, null, indent)}\n`)
			}
			await expect(
				seed(
					{ ...environment, SEEDER_JSON_INDENT: '3' },
					'extract',
					'--include',
					'directus_translations',
				),
			).rejects.toThrow('SEEDER_JSON_INDENT must be tab or space')
			await expect(
				seed(
					{ ...environment, SEEDER_BATCH_SIZE: '0' },
					'system',
					'--include',
					'directus_translations',
				),
			).rejects.toThrow('SEEDER_BATCH_SIZE')
			await expect(
				seed(
					{ ...environment, SEEDER_JSON_INDENT: 'space', SEEDER_JSON_INDENT_SIZE: '11' },
					'extract',
				),
			).rejects.toThrow('SEEDER_JSON_INDENT_SIZE')
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

	it('preserves an owned translation in insert-missing and updates it idempotently in insert-update', async () => {
		const id = randomUUID()
		const directory = `/tmp/seeder-e2e-${randomUUID()}`
		const fixture = { id, key: `seeder_e2e_${id}`, language: 'nl-NL', value: 'seeded' }
		const environment = {
			DEPLOYMENT_ENV: 'production',
			SEEDER_SEEDS_DIR: directory,
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
			await seed(
				{ ...environment, SEEDER_MODE: 'insert-update' },
				'system',
				'--mode',
				'insert-missing',
				'--include',
				'directus_translations',
			)
			expect(await client.request(readTranslation(id))).toMatchObject({
				...fixture,
				value: 'original',
			})
			await seed(
				{ ...environment, SEEDER_MODE: 'INSERT-UPDATE' },
				'system',
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
