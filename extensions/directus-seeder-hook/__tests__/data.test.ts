import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { envSchema } from '../src/env.schema'
import { createSeedDataProvider } from '../src/lib/seedDataParser'
import { getDataProviders, handlePolicyTFA, isSuperUser } from '../src/seeders/system/data'

let directory = ''

/**
 * Writes an owned seed fixture into the disposable seed folder.
 * @param collection - Target system collection.
 * @param data - JSON fixture data.
 * @returns The completed write.
 */
async function writeSeed(collection: string, data: unknown) {
	await writeFile(path.join(directory, `${collection}.json`), JSON.stringify(data))
}

/**
 * Loads and combines all providers as the seeder does.
 * @param env - Environment overrides for the fixture.
 * @returns Seed data indexed by collection name.
 */
async function loadData(env: Record<string, string> = {}) {
	return createSeedDataProvider(
		(await getDataProviders(envSchema.parse({ SEEDER_SEEDS_DIR: directory, ...env }))) ?? [],
	).getSeedData()
}

describe('system seed data', () => {
	beforeEach(async () => {
		directory = await mkdtemp(path.join(tmpdir(), 'seeder-data-'))
		vi.spyOn(console, 'warn').mockImplementation(() => undefined)
		vi.spyOn(console, 'log').mockImplementation(() => undefined)
		vi.spyOn(console, 'error').mockImplementation(() => undefined)
	})

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true })
	})

	it('preserves explicit policy TFA and requires it for admin or Studio access only in production', () => {
		const policy = { enforce_tfa: false, admin_access: true, app_access: false }
		expect(handlePolicyTFA(policy, { DEPLOYMENT_ENV: 'production' })).toMatchObject({
			enforce_tfa: true,
		})
		expect(
			handlePolicyTFA({ app_access: true }, { DEPLOYMENT_ENV: 'production' }),
		).toMatchObject({ enforce_tfa: true })
		expect(handlePolicyTFA(policy, { DEPLOYMENT_ENV: 'development' })).toEqual(policy)
		expect(
			handlePolicyTFA({ enforce_tfa: true }, { DEPLOYMENT_ENV: 'development' }),
		).toMatchObject({ enforce_tfa: true })
		expect(policy.enforce_tfa).toBe(false)
	})

	it('does not infer policy TFA from absent flags or a differently cased environment', () => {
		expect(handlePolicyTFA({}, { DEPLOYMENT_ENV: 'production' })).toMatchObject({
			enforce_tfa: false,
		})
		expect(
			handlePolicyTFA({ admin_access: true }, { DEPLOYMENT_ENV: 'Production' }),
		).toMatchObject({ enforce_tfa: false })
	})

	it('recognizes Admin User and title patterns and configures only superusers from the environment', async () => {
		expect(isSuperUser({ first_name: 'Admin', last_name: 'User' })).toBe(true)
		expect(isSuperUser({ title: 'SUPER USER' })).toBe(true)
		expect(isSuperUser({ first_name: 'Regular', last_name: 'User' })).toBe(false)
		const regular = { id: 'regular', email: 'regular@example.test', status: 'active' }
		await writeSeed('directus_users', [
			{ id: 'admin', first_name: 'Admin', last_name: 'Developer' },
			regular,
		])
		const env = {
			DEFAULT_EMAIL: 'fixture@example.test',
			DEFAULT_PASSWORD: 'fixture-password',
			DEPLOYMENT_ENV: 'development',
		}
		expect((await loadData(env)).directus_users).toEqual([
			{
				id: 'admin',
				first_name: 'Admin',
				last_name: 'Developer',
				email: env.DEFAULT_EMAIL,
				password: env.DEFAULT_PASSWORD,
				status: 'active',
			},
			regular,
		])
		expect(
			(await loadData({ ...env, DEPLOYMENT_ENV: 'production' })).directus_users?.[0],
		).toMatchObject({ status: 'suspended' })
	})

	it('filters development flows with their operations and appends reference updates after the first pass', async () => {
		await writeSeed('directus_flows', [
			{ id: 'live', name: 'Live' },
			{ id: 'dev', name: 'A [dEv] helper' },
		])
		await writeSeed('directus_operations', [
			{ id: 'first', key: 'first', flow: 'live', resolve: 'second', reject: null },
			{ id: 'second', key: 'second', flow: 'live', resolve: 'first' },
			{ id: 'dev-op', key: 'dev', flow: 'dev' },
		])
		const data = await loadData({ DEPLOYMENT_ENV: 'production' })
		expect(data.directus_flows).toEqual([{ id: 'live', name: 'Live' }])
		expect(data.directus_operations).toEqual([
			{ id: 'first', key: 'first', flow: 'live', resolve: null, reject: null },
			{ id: 'second', key: 'second', flow: 'live', resolve: null, reject: null },
			{ id: 'first', resolve: 'second', reject: null, __isUpdateOnly: true },
			{ id: 'second', resolve: 'first', reject: null, __isUpdateOnly: true },
		])
		expect((await loadData({ DEPLOYMENT_ENV: 'development' })).directus_flows).toHaveLength(2)
	})

	it('omits missing files while retaining explicit empty arrays and every array member', async () => {
		await writeSeed('directus_roles', [])
		await writeSeed('directus_translations', [
			null,
			3,
			'legacy',
			{ id: 'kept', arbitrary: { value: true } },
		])
		const data = await loadData()
		expect(Object.keys(data)).toEqual(['directus_roles', 'directus_translations'])
		expect(data).not.toHaveProperty('directus_access')
		expect(data.directus_roles).toEqual([])
		expect(data.directus_translations).toEqual([
			null,
			3,
			'legacy',
			{ id: 'kept', arbitrary: { value: true } },
		])
	})

	it.each(['{broken', '', ' \n\t'])(
		'rejects malformed or empty JSON content %j with the filename and collection',
		async (content) => {
			const filename = path.join(directory, 'directus_roles.json')
			await writeFile(filename, content)
			await expect(loadData()).rejects.toThrow(
				`Failed to load seed file "${filename}" for collection "directus_roles"`,
			)
		},
	)

	it.each([{}, null, 3, 'legacy', true])('rejects a non-array JSON root %j', async (data) => {
		await writeSeed('directus_roles', data)
		await expect(loadData()).rejects.toThrow('Expected a JSON array')
	})

	it('rejects an unreadable file instead of treating it as missing or empty', async () => {
		const filename = path.join(directory, 'directus_roles.json')
		await mkdir(filename)
		const result = loadData()
		await expect(result).rejects.toThrow(`Failed to load seed file "${filename}"`)
		await expect(result).rejects.toThrow('EISDIR')
	})

	it('rejects a seed directory that is a file with a clear error and its path', async () => {
		const filename = path.join(directory, 'not-a-directory')
		await writeFile(filename, 'file')
		await expect(loadData({ SEEDER_SEEDS_DIR: filename })).rejects.toThrow(
			`Seed path is not a directory: "${filename}"`,
		)
	})
})
