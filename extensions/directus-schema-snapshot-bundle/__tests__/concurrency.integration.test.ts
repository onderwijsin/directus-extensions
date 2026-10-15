import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createProcessWorker } from '@workspace/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface WorkerEvent {
	event: 'ready' | 'paused' | 'done'
	pid?: number
	point?: string
	exitCode?: number
	diffCalls?: number
	applications?: number
}

const script = fileURLToPath(new URL('./fixtures/snapshot-worker.mjs', import.meta.url))
const bundle = fileURLToPath(new URL('../dist/api.js', import.meta.url))

describe('schema snapshot coordination across Node processes', () => {
	let directory = ''
	const workers: { terminate: () => Promise<void> }[] = []

	beforeEach(async () => {
		directory = await mkdtemp(path.join(tmpdir(), 'schema-split-process-'))
	})

	afterEach(async () => {
		await Promise.all(workers.splice(0).map((worker) => worker.terminate()))
		await rm(directory, { recursive: true, force: true })
	})

	/**
	 * Starts an independent CLI with shared temporary storage and real built extension code.
	 * @returns A ready worker using the same filesystem as its peers.
	 */
	async function startWorker() {
		const worker = createProcessWorker<WorkerEvent>({
			script,
			args: [bundle, path.join(directory, 'snapshots')],
			env: {
				TMPDIR: directory,
				TMP: directory,
				TEMP: directory,
				SCHEMA_SPLIT_HARD_EXIT: 'false',
			},
		})
		workers.push(worker)
		expect(await worker.next()).toMatchObject({ event: 'ready' })
		return worker
	}

	it('rejects apply while a snapshot is paused before writing definitions', async () => {
		const writer = await startWorker()
		const apply = await startWorker()
		writer.send({ args: ['snapshot'], pauseAt: 'definition' })
		expect(await writer.next()).toEqual({ event: 'paused', point: 'definition' })

		apply.send({ args: ['apply'] })
		expect(await apply.next()).toEqual({
			event: 'done',
			exitCode: 1,
			diffCalls: 0,
			applications: 0,
		})

		writer.send({ op: 'release' })
		expect(await writer.next()).toMatchObject({ event: 'done', exitCode: 0 })
		apply.send({ args: ['apply'] })
		expect(await apply.next()).toEqual({
			event: 'done',
			exitCode: 0,
			diffCalls: 1,
			applications: 0,
		})
	})

	it.each(['diff', 'apply', 'diff:11'])(
		'holds the lock and apply flag through %s, rejecting other applies and both writers',
		async (pauseAt) => {
			await mkdir(path.join(directory, 'snapshots'))
			await writeFile(
				path.join(directory, 'snapshots/metadata.yml'),
				JSON.stringify({ version: 1, directus: '12.2.0', vendor: 'sqlite' }),
			)
			const applying = await startWorker()
			const contender = await startWorker()
			applying.send({ args: ['apply'], pauseAt, forceDiffs: pauseAt === 'diff:11' ? 10 : 0 })
			expect(await applying.next()).toEqual({ event: 'paused', point: pauseAt })
			for (const args of [
				['apply'],
				['snapshot'],
				['migrate', '-i', '/unused.yml'],
				['apply', path.join(directory, 'another-snapshot')],
			]) {
				contender.send({ args })
				expect(await contender.next()).toEqual({
					event: 'done',
					exitCode: 1,
					diffCalls: 0,
					applications: 0,
				})
				expect(existsSync(path.join(directory, 'directus-schema-applying.flag'))).toBe(true)
			}
			applying.send({ op: 'release' })
			expect(await applying.next()).toMatchObject({ event: 'done', exitCode: 0 })
			expect(existsSync(path.join(directory, 'directus-schema-applying.flag'))).toBe(false)
			contender.send({ args: ['snapshot'] })
			expect(await contender.next()).toMatchObject({ event: 'done', exitCode: 0 })
		},
	)

	it.each(['snapshot', 'migrate'])(
		'leaves failed %s output without metadata and releases the operation lock',
		async (command) => {
			const writer = await startWorker()
			writer.send({ args: ['snapshot'] })
			expect(await writer.next()).toMatchObject({ event: 'done', exitCode: 0 })
			const input = path.join(directory, 'native.yml')
			await writeFile(
				input,
				JSON.stringify({
					version: 1,
					directus: '12.2.0',
					vendor: 'sqlite',
					collections: [],
					fields: [],
					relations: [],
					systemFields: [
						{
							collection: 'directus_files',
							field: 'title',
							schema: { is_indexed: true },
						},
					],
				}),
			)
			writer.send({
				args: command === 'snapshot' ? ['snapshot'] : ['migrate', '-i', input],
				failWrite: true,
			})
			expect(await writer.next()).toMatchObject({ event: 'done', exitCode: 1 })
			expect(existsSync(path.join(directory, 'snapshots/metadata.yml'))).toBe(false)
			expect(
				existsSync(path.join(directory, 'directus-schema-snapshot/operation.lock')),
			).toBe(false)
			const apply = await startWorker()
			apply.send({ args: ['apply'] })
			expect(await apply.next()).toEqual({
				event: 'done',
				exitCode: 1,
				diffCalls: 0,
				applications: 0,
			})
		},
	)

	it('fails closed after a killed writer, including after an operator removes its stale lock', async () => {
		const writer = await startWorker()
		writer.send({ args: ['snapshot'], pauseAt: 'definition' })
		expect(await writer.next()).toEqual({ event: 'paused', point: 'definition' })
		await writer.terminate()
		const apply = await startWorker()
		apply.send({ args: ['apply'] })
		expect(await apply.next()).toEqual({
			event: 'done',
			exitCode: 1,
			diffCalls: 0,
			applications: 0,
		})
		await rm(path.join(directory, 'directus-schema-snapshot/operation.lock'), {
			recursive: true,
		})
		apply.send({ args: ['apply'] })
		expect(await apply.next()).toEqual({
			event: 'done',
			exitCode: 1,
			diffCalls: 0,
			applications: 0,
		})
	})
})
