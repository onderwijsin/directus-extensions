import { execFile } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createCollection,
	createDirectus,
	createItem,
	createPermission,
	createPolicy,
	createPreset,
	createRelation,
	createTranslation,
	deleteCollection,
	deleteItem,
	deletePermission,
	deletePolicy,
	deletePreset,
	deleteRole,
	deleteTranslation,
	readPermissions,
	readItems,
	readPresets,
	readRoles,
	readTranslation,
	readTranslations,
	rest,
	staticToken,
	updateItem,
	updateTranslation,
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

interface CoreCategory {
	slug: string
	title: string
}

interface CoreArticle {
	key: number
	title: string
	category: string
	notes: string | null
}

const categories = 'seeder_e2e_categories'
const articles = 'seeder_e2e_articles'
const coreClient = createDirectus<{
	seeder_e2e_categories: CoreCategory[]
	seeder_e2e_articles: CoreArticle[]
}>(baseUrl)
	.with(rest())
	.with(staticToken(token))

/**
 * Runs fixture filesystem operations inside the disposable Directus container.
 * @param script - Node script receiving the remaining arguments.
 * @param args - Literal script arguments.
 * @returns Captured process output.
 */
function inDirectus(script: string, ...args: string[]) {
	return execute('docker', [...composeArguments, 'directus', 'node', '-e', script, ...args], {
		timeout: 60_000,
	})
}

type AutoExtractRequest = (
	path: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body?: unknown,
) => Promise<void>

/**
 * Runs an auxiliary installed Directus server with isolated automatic-extraction settings.
 * HTTP stays inside the disposable container; the runner owns its final container cleanup.
 * @param directory - Fixture directory containing configuration and temporary process files.
 * @param environment - Server-specific environment overrides.
 * @param run - Scenario issuing real HTTP requests to this server.
 * @returns Resolves after the server has been stopped, including on startup/assertion failures.
 */
async function withAutoExtractServer(
	directory: string,
	environment: Record<string, string>,
	run: (request: AutoExtractRequest) => Promise<void>,
) {
	if (!token) throw new Error('The Directus E2E token was not initialized')
	const port = String(randomInt(20_000, 30_000))
	try {
		await inDirectus(
			`const fs = require('node:fs');
			const { spawn } = require('node:child_process');
			const [root, environment, port] = process.argv.slice(1);
			const log = fs.openSync(root + '/server.log', 'a');
			const server = spawn(process.execPath, ['/directus/cli.js', 'start'], {
				env: { ...process.env, ...JSON.parse(environment), HOST: '127.0.0.1', PORT: port },
				detached: true,
				stdio: ['ignore', log, log],
			});
			fs.writeFileSync(root + '/server.pid', String(server.pid));
			fs.closeSync(log);
			server.unref();`,
			directory,
			JSON.stringify(environment),
			port,
		)
		await inDirectus(
			`const { setTimeout: delay } = require('node:timers/promises');
			(async () => {
				const deadline = Date.now() + 55_000;
				while (Date.now() < deadline) {
					try {
						const response = await fetch('http://127.0.0.1:' + process.argv[1] + '/server/ping', {
							signal: AbortSignal.timeout(1_000),
						});
						if (response.ok) return;
					} catch {}
					await delay(250);
				}
				throw new Error('Auxiliary Directus server did not become ready');
			})().catch(error => { console.error(error); process.exitCode = 1; });`,
			port,
		)
		await run(async (path, method, body) => {
			await inDirectus(
				`const [port, token, path, method, body] = process.argv.slice(1);
				(async () => {
					const response = await fetch('http://127.0.0.1:' + port + path, {
						method,
						headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
						...(body ? { body } : {}),
						signal: AbortSignal.timeout(10_000),
					});
					if (!response.ok) throw new Error(method + ' ' + path + ': ' + response.status + ' ' + await response.text());
					await response.arrayBuffer();
				})().catch(error => { console.error(error); process.exitCode = 1; });`,
				port,
				token,
				path,
				method,
				body === undefined ? '' : JSON.stringify(body),
			)
		})
	} catch (error) {
		const { stdout } = await inDirectus(
			'const fs = require("node:fs"); const log = process.argv[1] + "/server.log"; if (fs.existsSync(log)) process.stdout.write(fs.readFileSync(log, "utf8"))',
			directory,
		)
		// execFile errors include argv; keep the ephemeral bearer token out of test diagnostics.
		if (error instanceof Error)
			throw new Error(`${error.message.replaceAll(token, '[redacted]')}\n${stdout}`)
		throw error
	} finally {
		await inDirectus(
			`const fs = require('node:fs');
			const { setTimeout: delay } = require('node:timers/promises');
			(async () => {
				const filename = process.argv[1] + '/server.pid';
				if (!fs.existsSync(filename)) return;
				const pid = Number(fs.readFileSync(filename, 'utf8'));
				try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
				const deadline = Date.now() + 5_000;
				while (Date.now() < deadline) {
					try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
					await delay(100);
				}
				try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
			})().catch(error => { console.error(error); process.exitCode = 1; });`,
			directory,
		)
	}
}

/**
 * Owns two application collections with non-id primary keys and a real scalar foreign key.
 * @param run - Scenario using an isolated container seed directory.
 * @returns Resolves after the scenario and all fixture cleanup.
 */
async function withCoreCollections(run: (directory: string) => Promise<void>) {
	const directory = `/tmp/seeder-core-e2e-${randomUUID()}`
	let categoriesCreated = false
	let articlesCreated = false
	try {
		await client.request(
			createCollection({
				collection: categories,
				schema: {},
				meta: {},
				fields: [
					{
						field: 'slug',
						type: 'string',
						schema: { is_primary_key: true, is_nullable: false },
					},
					{ field: 'title', type: 'string' },
				],
			}),
		)
		categoriesCreated = true
		await client.request(
			createCollection({
				collection: articles,
				schema: {},
				meta: {},
				fields: [
					{
						field: 'key',
						type: 'integer',
						schema: {
							is_primary_key: true,
							is_nullable: false,
							has_auto_increment: false,
						},
					},
					{ field: 'title', type: 'string' },
					{ field: 'category', type: 'string' },
					{ field: 'notes', type: 'string' },
				],
			}),
		)
		articlesCreated = true
		await client.request(
			createRelation({
				collection: articles,
				field: 'category',
				related_collection: categories,
				schema: { on_delete: 'RESTRICT' },
				meta: {
					many_collection: articles,
					many_field: 'category',
					one_collection: categories,
				},
			}),
		)
		await run(directory)
	} finally {
		try {
			if (articlesCreated) await client.request(deleteCollection(articles))
		} finally {
			try {
				if (categoriesCreated) await client.request(deleteCollection(categories))
			} finally {
				await inDirectus(
					'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })',
					directory,
				)
			}
		}
	}
}

describe('installed seeder CLI', () => {
	// Includes auxiliary startup, three debounce periods, polling, and fixture teardown.
	it('auto-extracts real core CRUD with mixed system events and scope-isolated cleanup', async () => {
		await withCoreCollections(async (directory) => {
			const translation = {
				id: randomUUID(),
				key: `seeder_auto_e2e_${randomUUID()}`,
				language: 'nl-NL',
				value: 'mixed batch',
			}
			const historicalRole = randomUUID()
			const fixture = { slug: 'auto', title: 'created' }
			await inDirectus(
				`const fs = require('node:fs');
					const [root, config, categories, historicalRole] = process.argv.slice(1);
					fs.mkdirSync(root + '/seeds/core', { recursive: true });
					fs.mkdirSync(root + '/seeds/system/assets', { recursive: true });
					fs.writeFileSync(root + '/config.json', config);
					fs.writeFileSync(root + '/seeds/core/' + categories + '.managed-ids.json', '["historical"]');
					fs.writeFileSync(root + '/seeds/system/directus_roles.managed-ids.json', JSON.stringify([historicalRole]));
					for (const scope of ['core', 'system']) fs.writeFileSync(root + '/seeds/' + scope + '/stale.json', '[]');
					fs.writeFileSync(root + '/seeds/system/assets/sentinel.bin', 'protected asset');`,
				directory,
				JSON.stringify({
					core: {
						collections: {
							[categories]: {
								operationMode: 'insert-update',
								management: { type: 'manifest' },
								fields: ['slug', 'title'],
							},
							[articles]: {
								operationMode: 'insert-update',
								fields: ['key', 'title'],
							},
						},
					},
					system: {
						collections: {
							directus_translations: { filter: { id: { _eq: translation.id } } },
						},
					},
				}),
				categories,
				historicalRole,
			)

			/**
			 * Observes both scopes without requiring extraction files to exist yet.
			 * @returns Current JSON output and cleanup sentinels.
			 */
			async function readOutput() {
				const { stdout } = await inDirectus(
					`const fs = require('node:fs');
						const [root, categories, articles] = process.argv.slice(1);
						const filename = name => root + '/seeds/' + name;
						const read = name => fs.existsSync(filename(name)) ? JSON.parse(fs.readFileSync(filename(name), 'utf8')) : null;
						const asset = filename('system/assets/sentinel.bin');
						process.stdout.write(JSON.stringify({
							core: read('core/' + categories + '.json'),
							manifest: read('core/' + categories + '.managed-ids.json'),
							excluded: read('core/' + articles + '.json'),
							coreStale: fs.existsSync(filename('core/stale.json')),
							coreAssets: fs.existsSync(filename('core/assets')),
							system: read('system/directus_translations.json'),
							systemManifest: read('system/directus_roles.managed-ids.json'),
							systemStale: fs.existsSync(filename('system/stale.json')),
							asset: fs.existsSync(asset) ? fs.readFileSync(asset, 'utf8') : null,
						}));`,
					directory,
					categories,
					articles,
				)
				const output: unknown = JSON.parse(stdout)
				return output
			}

			const firstBatch = {
				core: [fixture],
				manifest: ['auto', 'historical'],
				excluded: null,
				coreStale: false,
				coreAssets: false,
				system: null,
				systemManifest: [historicalRole],
				systemStale: true,
				asset: 'protected asset',
			}
			try {
				await withAutoExtractServer(
					directory,
					{
						DEPLOYMENT_ENV: 'development',
						SEEDER_AUTO_EXTRACT_SYSTEM: 'true',
						SEEDER_AUTO_EXTRACT_CORE: 'true',
						SEEDER_CONFIG_PATH: `${directory}/config.json`,
						SEEDER_SEEDS_DIR: `${directory}/seeds`,
						SEEDER_ASSETS_DIR: `${directory}/seeds/system/assets`,
						SEEDER_JSON_ONLY: 'false',
						SEEDER_INCLUDE: `${categories},${articles},directus_translations`,
						SEEDER_EXCLUDE: articles,
					},
					async (request) => {
						// Each assertion waits for a distinct real 15-second debounce batch.
						await request(`/items/${categories}`, 'POST', fixture)
						await expect
							.poll(readOutput, { interval: 1_000, timeout: 30_000 })
							.toEqual(firstBatch)

						await request(`/items/${categories}/${fixture.slug}`, 'PATCH', {
							title: 'updated',
						})
						await request('/translations', 'POST', translation)
						const mixedBatch = {
							...firstBatch,
							core: [{ ...fixture, title: 'updated' }],
							system: [translation],
							systemStale: false,
							asset: null,
						}
						await expect
							.poll(readOutput, { interval: 1_000, timeout: 30_000 })
							.toEqual(mixedBatch)

						await inDirectus(
							'const fs = require("node:fs"); const root = process.argv[1]; for (const scope of ["core", "system"]) fs.writeFileSync(root + "/seeds/" + scope + "/stale.json", "[]"); fs.writeFileSync(root + "/seeds/system/assets/sentinel.bin", "protected asset")',
							directory,
						)
						await request(`/items/${categories}/${fixture.slug}`, 'DELETE')
						await expect
							.poll(readOutput, { interval: 1_000, timeout: 30_000 })
							.toEqual({ ...firstBatch, core: [], system: [translation] })
					},
				)
			} finally {
				const translations = await client.request(
					readTranslations({ filter: { id: { _eq: translation.id } } }),
				)
				if (translations.length > 0) await client.request(deleteTranslation(translation.id))
			}
		})
	}, 180_000)

	it('extracts isolated core manifests and imports custom primary keys in configured order', async () => {
		await withCoreCollections(async (directory) => {
			const environment = {
				DEPLOYMENT_ENV: 'development',
				SEEDER_CONFIG_PATH: `${directory}/config.json`,
				SEEDER_SEEDS_DIR: `${directory}/seeds`,
				SEEDER_ENABLE_FULL_IDEMPOTENT: 'true',
			}
			for (const slug of ['News', 'Archive', 'New'])
				await coreClient.request(createItem(categories, { slug, title: 'selected' }))
			for (const key of [2, 10, 30])
				await coreClient.request(
					createItem(articles, {
						key,
						title: 'selected',
						category: key === 30 ? 'New' : 'News',
						notes: 'not exported',
					}),
				)
			await inDirectus(
				'const fs = require("node:fs"); const [root, config] = process.argv.slice(1); fs.mkdirSync(`${root}/seeds/system/assets`, { recursive: true }); fs.writeFileSync(`${root}/config.json`, config); fs.writeFileSync(`${root}/seeds/system/sentinel.json`, "system sentinel"); fs.writeFileSync(`${root}/seeds/system/assets/sentinel.bin`, "system asset")',
				directory,
				JSON.stringify({
					core: {
						order: [categories],
						collections: {
							[articles]: {
								operationMode: 'full-idempotent',
								management: { type: 'manifest' },
								fields: ['key', 'title', 'category'],
								filter: { title: { _eq: 'selected' } },
								sort: ['key'],
							},
							[categories]: {
								operationMode: 'insert-missing',
								management: { type: 'manifest' },
								fields: ['slug', 'title'],
								filter: { title: { _eq: 'selected' } },
								sort: ['slug'],
							},
						},
					},
				}),
			)
			await seed(
				environment,
				'extract',
				'--scope',
				'both',
				'--json-only',
				'--skip-clean',
				'--include',
				categories,
				articles,
				'directus_roles',
			)
			const initial = await inDirectus(
				'const fs = require("node:fs"); const [root, categories, articles] = process.argv.slice(1); const read = name => JSON.parse(fs.readFileSync(`${root}/seeds/core/${name}`, "utf8")); process.stdout.write(JSON.stringify({ categories: read(`${categories}.managed-ids.json`), articles: read(`${articles}.managed-ids.json`), rows: read(`${articles}.json`), assets: fs.existsSync(`${root}/seeds/core/assets`), system: Array.isArray(JSON.parse(fs.readFileSync(`${root}/seeds/system/directus_roles.json`, "utf8"))) }))',
				directory,
				categories,
				articles,
			)
			expect(JSON.parse(initial.stdout)).toEqual({
				categories: ['Archive', 'New', 'News'],
				articles: [2, 10, 30],
				assets: false,
				system: true,
				rows: [
					{ key: 2, title: 'selected', category: 'News' },
					{ key: 10, title: 'selected', category: 'News' },
					{ key: 30, title: 'selected', category: 'New' },
				],
			})
			await coreClient.request(updateItem(articles, 10, { title: 'historical' }))
			await coreClient.request(updateItem(categories, 'Archive', { title: 'historical' }))
			await coreClient.request(deleteItem(articles, 30))
			await coreClient.request(deleteItem(categories, 'New'))
			await inDirectus(
				'require("node:fs").writeFileSync(`${process.argv[1]}/seeds/core/stale.json`, "[]")',
				directory,
			)
			await seed(environment, 'extract', '--scope', 'core', '--assets')
			const cleaned = await inDirectus(
				'const fs = require("node:fs"); const [root, categories, articles] = process.argv.slice(1); const read = name => JSON.parse(fs.readFileSync(`${root}/seeds/core/${name}`, "utf8")); process.stdout.write(JSON.stringify({ categories: read(`${categories}.managed-ids.json`), articles: read(`${articles}.managed-ids.json`), rows: read(`${articles}.json`), stale: fs.existsSync(`${root}/seeds/core/stale.json`), system: fs.readFileSync(`${root}/seeds/system/sentinel.json`, "utf8"), asset: fs.readFileSync(`${root}/seeds/system/assets/sentinel.bin`, "utf8") }))',
				directory,
				categories,
				articles,
			)
			expect(JSON.parse(cleaned.stdout)).toEqual({
				categories: ['Archive', 'New', 'News'],
				articles: [2, 10, 30],
				rows: [{ key: 2, title: 'selected', category: 'News' }],
				stale: false,
				system: 'system sentinel',
				asset: 'system asset',
			})
			await coreClient.request(
				createItem(articles, { key: 99, title: 'outsider', category: 'Archive' }),
			)
			await inDirectus(
				'const fs = require("node:fs"); const [root, categories, articles, categoryRows, articleRows] = process.argv.slice(1); fs.writeFileSync(`${root}/seeds/core/${categories}.json`, categoryRows); fs.writeFileSync(`${root}/seeds/core/${articles}.json`, articleRows)',
				directory,
				categories,
				articles,
				JSON.stringify([
					{ slug: 'News', title: 'seeded' },
					{ slug: 'New', title: 'created' },
				]),
				JSON.stringify([
					{ key: 2, title: 'seeded', category: 'News' },
					{ key: 30, title: 'created', category: 'New' },
				]),
			)
			// The prefix must create New before its article despite the opposite object order.
			await seed(environment, 'core', '--yes')
			expect(await coreClient.request(readItems(categories, { sort: ['slug'] }))).toEqual([
				{ slug: 'Archive', title: 'historical' },
				{ slug: 'New', title: 'created' },
				{ slug: 'News', title: 'selected' },
			])
			expect(
				await coreClient.request(
					readItems(articles, { fields: ['key', 'title', 'category'], sort: ['key'] }),
				),
			).toEqual([
				{ key: 2, title: 'seeded', category: 'News' },
				{ key: 30, title: 'created', category: 'New' },
				{ key: 99, title: 'outsider', category: 'Archive' },
			])
			await seed(environment, 'core', '--full-reset', '--yes', '--include', articles)
			expect(
				await coreClient.request(readItems(articles, { fields: ['key'], sort: ['key'] })),
			).toEqual([{ key: 2 }, { key: 30 }])
			const manifest = await inDirectus(
				'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))',
				`${directory}/seeds/core/${articles}.managed-ids.json`,
			)
			expect(JSON.parse(manifest.stdout)).toEqual([2, 10, 30])
		})
	})

	it('preflights core ranges and scalar relations before mutations and preserves unmanaged rows', async () => {
		await withCoreCollections(async (directory) => {
			const environment = {
				DEPLOYMENT_ENV: 'production',
				SEEDER_CONFIG_PATH: `${directory}/config.json`,
				SEEDER_SEEDS_DIR: `${directory}/seeds`,
				SEEDER_ENABLE_FULL_IDEMPOTENT: 'true',
				SEEDER_CONTINUE_ON_ERROR: 'true',
			}
			for (const slug of ['News', 'Outside'])
				await coreClient.request(createItem(categories, { slug, title: 'original' }))
			for (const key of [2, 10, 11])
				await coreClient.request(
					createItem(articles, {
						key,
						title: 'original',
						category: key === 11 ? 'Outside' : 'News',
					}),
				)
			const coreConfig = {
				order: [categories],
				collections: {
					[categories]: { operationMode: 'insert-update' },
					[articles]: {
						operationMode: 'full-idempotent',
						management: { type: 'id-range', min: 2, max: 11 },
					},
				},
			}
			await inDirectus(
				'const fs = require("node:fs"); const [root, config, categories, articles] = process.argv.slice(1); fs.mkdirSync(`${root}/seeds/core`, { recursive: true }); fs.writeFileSync(`${root}/config.json`, config); fs.writeFileSync(`${root}/seeds/core/${categories}.json`, JSON.stringify([{ slug: "News", title: "changed" }])); fs.writeFileSync(`${root}/seeds/core/${articles}.json`, JSON.stringify([{ key: 11, title: "invalid", category: "News" }]))',
				directory,
				JSON.stringify({ core: coreConfig }),
				categories,
				articles,
			)
			await expect(seed(environment, 'core', '--yes')).rejects.toMatchObject({
				code: 1,
				stdout: expect.stringContaining(articles),
			})
			expect(
				await coreClient.request(
					readItems(categories, { filter: { slug: { _eq: 'News' } } }),
				),
			).toEqual([{ slug: 'News', title: 'original' }])
			await inDirectus(
				'require("node:fs").writeFileSync(process.argv[1], JSON.stringify([{ key: 2, title: "ranged", category: "News" }]))',
				`${directory}/seeds/core/${articles}.json`,
			)
			await seed(
				environment,
				'core',
				'--yes',
				'--include',
				categories,
				articles,
				'--exclude',
				categories,
			)
			expect(
				await coreClient.request(
					readItems(articles, { fields: ['key', 'title'], sort: ['key'] }),
				),
			).toEqual([
				{ key: 2, title: 'ranged' },
				{ key: 11, title: 'original' },
			])
			await inDirectus(
				'const fs = require("node:fs"); const [root, articles, categories] = process.argv.slice(1); const config = JSON.parse(fs.readFileSync(`${root}/config.json`, "utf8")); config.core.collections[articles].management = { type: "relation", field: "category", collection: categories }; fs.writeFileSync(`${root}/config.json`, JSON.stringify(config)); fs.writeFileSync(`${root}/seeds/core/${articles}.json`, "[]")',
				directory,
				articles,
				categories,
			)
			// Only raw source slugs define the boundary; the unselected source is never imported.
			await seed(environment, 'core', '--yes', '--include', articles)
			expect(
				await coreClient.request(readItems(articles, { fields: ['key', 'category'] })),
			).toEqual([{ key: 11, category: 'Outside' }])
			await inDirectus(
				'require("node:fs").writeFileSync(process.argv[1], JSON.stringify([{ key: 11, title: "collision", category: "News" }]))',
				`${directory}/seeds/core/${articles}.json`,
			)
			await expect(seed(environment, 'core', '--yes')).rejects.toMatchObject({
				code: 1,
				stdout: expect.stringContaining(articles),
			})
			expect(
				await coreClient.request(
					readItems(categories, { filter: { slug: { _eq: 'News' } } }),
				),
			).toEqual([{ slug: 'News', title: 'original' }])
			expect(
				await coreClient.request(
					readItems(articles, { fields: ['key', 'title', 'category'] }),
				),
			).toEqual([{ key: 11, title: 'original', category: 'Outside' }])
			await seed(environment, 'core', '--yes', '--include', categories)
			expect(
				await coreClient.request(
					readItems(categories, { filter: { slug: { _eq: 'News' } } }),
				),
			).toEqual([{ slug: 'News', title: 'changed' }])
		})
	})

	it('inspects configuration without seed input and bypasses consumer files for defaults', async () => {
		const directory = `/tmp/seeder-config-e2e-${randomUUID()}`
		const environment = {
			LOG_LEVEL: 'silent',
			DEPLOYMENT_ENV: 'development',
			SEEDER_AUTO_EXTRACT_SYSTEM: 'true',
			SEEDER_CONFIG_PATH: `${directory}/config.json`,
			SEEDER_SEEDS_DIR: `${directory}/missing-seeds`,
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
							operationMode: 'full-idempotent',
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
							directus_roles: {
								fields: ['id'],
								operationMode: 'full-idempotent',
								management: null,
							},
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
			SEEDER_ASSETS_DIR: `${directory}/seeds/system/assets`,
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
				`${directory}/seeds/system/directus_presets.json`,
			])
			const rows: unknown = JSON.parse(extracted.stdout)
			expect(rows).toEqual([expect.objectContaining({ id: min, bookmark: 'keep' })])
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'require("node:fs").writeFileSync(process.argv[1], process.argv[2])',
				`${directory}/seeds/system/directus_presets.json`,
				JSON.stringify([
					{ id: min, collection: 'directus_roles', bookmark: 'updated' },
					{ id: min + 2, collection: 'directus_roles', bookmark: 'created' },
				]),
			])
			// Consumer full-idempotent overrides the built-in insert-update mode for presets.
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

	it('retains manifest history, synchronizes managed UUIDs, and resets the full collection', async () => {
		const ids = [randomUUID(), randomUUID(), randomUUID()].sort()
		const [keptId, historicalId, outsiderId] = ids
		if (!keptId || !historicalId || !outsiderId)
			throw new Error('Expected three translation IDs')
		const directory = `/tmp/seeder-manifest-e2e-${randomUUID()}`
		const seedsDirectory = `${directory}/seeds/system`
		const manifestPath = `${seedsDirectory}/directus_translations.managed-ids.json`
		const environment = {
			DEPLOYMENT_ENV: 'development',
			SEEDER_CONFIG_PATH: `${directory}/config.json`,
			SEEDER_SEEDS_DIR: `${directory}/seeds`,
			SEEDER_ASSETS_DIR: `${directory}/assets`,
			SEEDER_ENABLE_FULL_IDEMPOTENT: 'true',
		}
		const kept = {
			id: keptId,
			key: `seeder_manifest_${keptId}`,
			language: 'nl-NL',
			value: 'selected',
		}
		const historical = { ...kept, id: historicalId, key: `seeder_manifest_${historicalId}` }
		const outsider = {
			...kept,
			id: outsiderId,
			key: `seeder_manifest_${outsiderId}`,
			value: 'outsider',
		}
		try {
			for (const translation of [kept, historical])
				await client.request(createTranslation(translation))
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
							directus_translations: {
								operationMode: 'full-idempotent',
								management: { type: 'manifest' },
								filter: {
									_and: [{ id: { _in: ids } }, { value: { _eq: 'selected' } }],
								},
								sort: ['-id'],
							},
						},
					},
				}),
			])
			await seed(environment, 'extract', '--json-only', '--include', 'directus_translations')
			const manifest = await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))',
				manifestPath,
			])
			expect(JSON.parse(manifest.stdout)).toEqual([keptId, historicalId])

			await client.request(updateTranslation(historicalId, { value: 'historical' }))
			await client.request(createTranslation(outsider))
			// Default cleanup must retain history even when the current query returns only A.
			await seed(environment, 'extract', '--json-only', '--include', 'directus_translations')
			const extracted = await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'const fs = require("node:fs"); const root = process.argv[1]; process.stdout.write(JSON.stringify({ rows: JSON.parse(fs.readFileSync(`${root}/directus_translations.json`, "utf8")), manifest: fs.readFileSync(`${root}/directus_translations.managed-ids.json`, "utf8") }))',
				seedsDirectory,
			])
			expect(JSON.parse(extracted.stdout)).toEqual({
				rows: [kept],
				manifest: manifest.stdout,
			})

			const updated = { ...kept, value: 'synchronized' }
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'require("node:fs").writeFileSync(process.argv[1], process.argv[2])',
				`${seedsDirectory}/directus_translations.json`,
				JSON.stringify([updated]),
			])
			await seed(environment, 'system', '--yes', '--include', 'directus_translations')
			expect(
				await client.request(
					readTranslations({
						filter: { id: { _in: ids } },
						fields: ['id', 'key', 'language', 'value'],
						sort: ['id'],
					}),
				),
			).toEqual([updated, outsider])
			const afterImport = await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))',
				manifestPath,
			])
			expect(afterImport.stdout).toBe(manifest.stdout)
			const configBeforeReset = await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))',
				environment.SEEDER_CONFIG_PATH,
			])
			await seed(
				environment,
				'system',
				'--yes',
				'--full-reset',
				'--include',
				'directus_translations',
			)
			expect(
				await client.request(
					readTranslations({
						filter: { id: { _in: ids } },
						fields: ['id', 'key', 'language', 'value'],
						sort: ['id'],
					}),
				),
			).toEqual([updated])
			for (const { path, original } of [
				{ path: manifestPath, original: manifest.stdout },
				{ path: environment.SEEDER_CONFIG_PATH, original: configBeforeReset.stdout },
			]) {
				const afterReset = await execute('docker', [
					...composeArguments,
					'directus',
					'node',
					'-e',
					'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))',
					path,
				])
				expect(afterReset.stdout).toBe(original)
			}
		} finally {
			try {
				for (const translation of await client.request(
					readTranslations({ filter: { id: { _in: ids } } }),
				))
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
	})

	it('extracts permissions into fresh output and repeats clean extraction without policy seed input', async () => {
		const policyId = randomUUID()
		const directory = `/tmp/seeder-extract-e2e-${randomUUID()}`
		const environment = {
			DEPLOYMENT_ENV: 'development',
			SEEDER_CONFIG_PATH: `${directory}/config.json`,
			SEEDER_SEEDS_DIR: `${directory}/seeds`,
			SEEDER_ASSETS_DIR: `${directory}/assets`,
		}
		await client.request(
			createPolicy({
				id: policyId,
				name: `Seeder extraction ${policyId}`,
				app_access: false,
				admin_access: false,
			}),
		)
		try {
			const permission = await client.request(
				createPermission({
					policy: policyId,
					collection: 'directus_roles',
					action: 'read',
					fields: ['*'],
				}),
			)
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'const fs = require("node:fs"); fs.mkdirSync(process.argv[1], { recursive: true }); fs.writeFileSync(`${process.argv[1]}/config.json`, process.argv[2])',
				directory,
				JSON.stringify({
					system: {
						collections: {
							directus_permissions: {
								filter: { policy: { _eq: policyId } },
								fields: ['id', 'policy'],
								management: {
									type: 'relation',
									field: 'policy',
									collection: 'directus_policies',
								},
							},
						},
					},
				}),
			])
			for (let run = 0; run < 2; run++) {
				await seed(
					environment,
					'extract',
					'--json-only',
					'--include',
					'directus_permissions',
				)
				const exported = await execute('docker', [
					...composeArguments,
					'directus',
					'node',
					'-e',
					'const fs = require("node:fs"); const root = process.argv[1]; if (fs.existsSync(`${root}/seeds/system/directus_policies.json`)) throw new Error("Unexpected policy seed input"); process.stdout.write(fs.readFileSync(`${root}/seeds/system/directus_permissions.json`, "utf8"))',
					directory,
				])
				expect(JSON.parse(exported.stdout)).toEqual([
					{ id: permission.id, policy: policyId },
				])
			}
		} finally {
			try {
				for (const permission of await client.request(
					readPermissions({ filter: { policy: { _eq: policyId } } }),
				))
					await client.request(deletePermission(permission.id))
				await client.request(deletePolicy(policyId))
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

	it('synchronizes only permissions of seed policies, rejects outsider collisions, and leaves permissions of removed source IDs untouched', async () => {
		const policyIds = [randomUUID(), randomUUID(), randomUUID()]
		const [managedId, removedId, outsiderId] = policyIds
		if (!managedId || !removedId || !outsiderId) throw new Error('Expected three policy IDs')
		const directory = `/tmp/seeder-relation-e2e-${randomUUID()}`
		const environment = {
			DEPLOYMENT_ENV: 'production',
			SEEDER_CONFIG_PATH: `${directory}/config.json`,
			SEEDER_SEEDS_DIR: `${directory}/seeds`,
			SEEDER_ENABLE_FULL_IDEMPOTENT: 'true',
		}
		const createdPolicies: string[] = []

		/**
		 * Replaces only the raw source and target input for the next CLI invocation.
		 * @param policies - Raw policy rows defining the bounded selection.
		 * @param permissions - Raw permission rows to synchronize.
		 * @returns Nothing.
		 */
		async function writeInputs(policies: unknown[], permissions: unknown[]) {
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'const fs = require("node:fs"); const [root, policies, permissions] = process.argv.slice(1); fs.writeFileSync(`${root}/seeds/system/directus_policies.json`, policies); fs.writeFileSync(`${root}/seeds/system/directus_permissions.json`, permissions)',
				directory,
				JSON.stringify(policies),
				JSON.stringify(permissions),
			])
		}

		try {
			for (const id of policyIds) {
				await client.request(
					createPolicy({
						id,
						name: `Seeder relation ${id}`,
						app_access: false,
						admin_access: false,
					}),
				)
				createdPolicies.push(id)
			}
			const kept = await client.request(
				createPermission({
					policy: managedId,
					collection: 'directus_roles',
					action: 'read',
					fields: ['*'],
				}),
			)
			const extra = await client.request(
				createPermission({
					policy: managedId,
					collection: 'directus_roles',
					action: 'update',
					fields: ['*'],
				}),
			)
			const removed = await client.request(
				createPermission({
					policy: removedId,
					collection: 'directus_roles',
					action: 'read',
					fields: ['*'],
				}),
			)
			const outsider = await client.request(
				createPermission({
					policy: outsiderId,
					collection: 'directus_roles',
					action: 'read',
					fields: ['*'],
				}),
			)
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'const fs = require("node:fs"); fs.mkdirSync(`${process.argv[1]}/seeds/system`, { recursive: true }); fs.writeFileSync(`${process.argv[1]}/config.json`, process.argv[2])',
				directory,
				JSON.stringify({
					system: {
						collections: {
							directus_permissions: {
								operationMode: 'full-idempotent',
								management: {
									type: 'relation',
									field: 'policy',
									collection: 'directus_policies',
								},
							},
						},
					},
				}),
			])
			const sources = [{ id: managedId }, { id: removedId }]
			const rows = [
				{
					id: kept.id,
					policy: managedId,
					collection: 'directus_translations',
					action: 'read',
					fields: ['*'],
				},
				{
					id: removed.id,
					policy: removedId,
					collection: 'directus_roles',
					action: 'read',
					fields: ['*'],
				},
			]
			await writeInputs(sources, rows)
			await seed(
				environment,
				'system',
				'--yes',
				'--include',
				'directus_permissions',
				'--exclude',
				'directus_policies',
			)
			const synchronized = await client.request(
				readPermissions({
					filter: { policy: { _in: policyIds } },
					fields: ['id', 'policy', 'collection'],
					sort: ['id'],
				}),
			)
			expect(synchronized).toEqual(
				expect.arrayContaining([
					{ id: kept.id, policy: managedId, collection: 'directus_translations' },
					{ id: removed.id, policy: removedId, collection: 'directus_roles' },
					{ id: outsider.id, policy: outsiderId, collection: 'directus_roles' },
				]),
			)
			expect(synchronized).toHaveLength(3)
			expect(synchronized.some(({ id }) => id === extra.id)).toBe(false)

			await writeInputs(sources, [{ ...rows[0], id: outsider.id, policy: managedId }])
			await expect(
				seed(environment, 'system', '--yes', '--include', 'directus_permissions'),
			).rejects.toMatchObject({ code: 1 })
			expect(
				await client.request(
					readPermissions({
						filter: { policy: { _eq: outsiderId } },
						fields: ['id', 'policy', 'collection'],
					}),
				),
			).toEqual([{ id: outsider.id, policy: outsiderId, collection: 'directus_roles' }])

			// Removing a source ID forgets its historical membership; only the remaining policy clears.
			await writeInputs([{ id: managedId }], [])
			await seed(environment, 'system', '--yes', '--include', 'directus_permissions')
			const survivors = await client.request(
				readPermissions({
					filter: { policy: { _in: policyIds } },
					fields: ['id', 'policy'],
					sort: ['id'],
				}),
			)
			expect(survivors).toHaveLength(2)
			expect(survivors).toEqual(
				expect.arrayContaining([
					{ id: removed.id, policy: removedId },
					{ id: outsider.id, policy: outsiderId },
				]),
			)
			await writeInputs([], [])
			await seed(environment, 'system', '--yes', '--include', 'directus_permissions')
			expect(
				await client.request(
					readPermissions({
						filter: { policy: { _in: policyIds } },
						fields: ['id', 'policy'],
						sort: ['id'],
					}),
				),
			).toEqual(survivors)
		} finally {
			try {
				for (const permission of await client.request(
					readPermissions({ filter: { policy: { _in: policyIds } } }),
				))
					await client.request(deletePermission(permission.id))
				for (const id of createdPolicies) await client.request(deletePolicy(id))
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
					'const fs = require("node:fs"); const [root, roles, translations] = process.argv.slice(1); fs.mkdirSync(`${root}/system`, { recursive: true }); fs.writeFileSync(`${root}/system/directus_roles.json`, roles); fs.writeFileSync(`${root}/system/directus_translations.json`, translations)',
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
						'--mode',
						'insert-missing',
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

	it('exits one on unreadable later input before earlier database writes despite continue-on-error', async () => {
		const id = randomUUID()
		const directory = `/tmp/seeder-e2e-${randomUUID()}`
		const filename = `${directory}/system/directus_permissions.json`
		try {
			await execute('docker', [
				...composeArguments,
				'directus',
				'node',
				'-e',
				'const fs = require("node:fs"); const [root, id] = process.argv.slice(1); fs.mkdirSync(`${root}/system`, { recursive: true }); fs.writeFileSync(`${root}/system/directus_roles.json`, JSON.stringify([{ id, name: "Seeder preflight fixture" }])); const filename = `${root}/system/directus_permissions.json`; fs.mkdirSync(filename)',
				directory,
				id,
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
	})

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
		{ mode: 'default', flags: [], retainAssets: false },
		{ mode: 'json-only', flags: ['--json-only'], retainAssets: true },
	])(
		'applies $mode output cleanup through the installed command',
		async ({ flags, retainAssets }) => {
			const directory = `/tmp/seeder-e2e-${randomUUID()}`
			const seeds = `${directory}/seeds/system`
			const assets = `${seeds}/assets`
			try {
				await execute('docker', [
					...composeArguments,
					'directus',
					'node',
					'-e',
					'const fs = require("node:fs"); const root = process.argv[1]; fs.mkdirSync(`${root}/seeds/system/assets/nested`, { recursive: true }); for (const name of ["seeds/system/stale.json", "seeds/system/notes.txt", "seeds/system/assets/stale.bin", "seeds/system/assets/binary.json", "seeds/system/assets/nested/keep.bin", "outside.json"]) fs.writeFileSync(`${root}/${name}`, name)',
					directory,
				])
				await seed(
					{
						DEPLOYMENT_ENV: 'development',
						SEEDER_SEEDS_DIR: `${directory}/seeds`,
						SEEDER_ASSETS_DIR: assets,
						SEEDER_JSON_ONLY: 'false',
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
					'const fs = require("node:fs"); const root = process.argv[1]; process.stdout.write(JSON.stringify({ staleJson: fs.existsSync(`${root}/seeds/system/stale.json`), staleAsset: fs.existsSync(`${root}/seeds/system/assets/stale.bin`), jsonAsset: fs.existsSync(`${root}/seeds/system/assets/binary.json`), nested: fs.readFileSync(`${root}/seeds/system/assets/nested/keep.bin`, "utf8"), notes: fs.readFileSync(`${root}/seeds/system/notes.txt`, "utf8"), outside: fs.readFileSync(`${root}/outside.json`, "utf8"), outputIsArray: Array.isArray(JSON.parse(fs.readFileSync(`${root}/seeds/system/directus_roles.json`, "utf8"))) }))',
					directory,
				])
				const output: unknown = JSON.parse(stdout)
				expect(output).toEqual({
					staleJson: false,
					staleAsset: retainAssets,
					jsonAsset: retainAssets,
					nested: 'seeds/system/assets/nested/keep.bin',
					notes: 'seeds/system/notes.txt',
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

	it('serializes configured indentation and fails startup for an invalid width', async () => {
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
			const result = await seed(
				{
					...environment,
					SEEDER_JSON_INDENT: 'space',
					SEEDER_JSON_INDENT_SIZE: '4',
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
				`${directory}/system/directus_translations.json`,
			])
			const records: unknown = JSON.parse(stdout)
			expect(records).toEqual(expect.arrayContaining([expect.objectContaining(fixture)]))
			expect(stdout).toBe(`${JSON.stringify(records, null, 4)}\n`)
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
				'const fs = require("node:fs"); fs.mkdirSync(`${process.argv[1]}/system`, { recursive: true }); fs.writeFileSync(`${process.argv[1]}/system/directus_translations.json`, process.argv[2])',
				directory,
				JSON.stringify([fixture]),
			])
			await seed(
				environment,
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
