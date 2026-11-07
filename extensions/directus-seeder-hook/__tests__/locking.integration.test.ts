import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createProcessWorker } from '@workspace/test-utils'
import { describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./fixtures/lock-worker.mjs', import.meta.url))
const bundle = fileURLToPath(new URL('../dist/index.js', import.meta.url))

describe('built seeder process lock', () => {
	it('preserves other owners through contention, stale replacement and process exit', async () => {
		const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'seeder-process-')))
		const workers: { terminate: () => Promise<void> }[] = []
		const lock = path.join(directory, 'directus-lock-bulk-operation.flag')
		/**
		 * Starts the real built hook with process-local temporary storage.
		 * @param mode - CLI owner or auto-extraction contender.
		 * @returns The ready worker protocol.
		 */
		async function start(mode: string) {
			const worker = createProcessWorker<{ event: string; code?: number }>({
				script,
				args: [bundle, mode, directory],
				env: { TMPDIR: directory, TEMP: directory, TMP: directory },
				timeoutMs: 25_000,
			})
			workers.push(worker)
			expect(await worker.next()).toEqual({ event: 'ready' })
			return worker
		}
		try {
			await mkdir(path.join(directory, 'system'))
			await writeFile(path.join(directory, 'system', 'directus_translations.json'), '[]')
			const owner = await start('owner')
			owner.send('seed')
			expect(await owner.next()).toEqual({ event: 'held' })
			expect(existsSync(lock)).toBe(true)
			const contender = await start('auto')
			contender.send('auto')
			expect(await contender.next()).toEqual({ event: 'skipped' })
			expect(existsSync(lock)).toBe(true)
			const ownerFlag = await readFile(lock, 'utf8')
			for (const command of ['seed', 'extract']) {
				const competing = await start('cli')
				competing.send(command)
				expect(await competing.next()).toEqual({ event: 'exited', code: 1 })
				expect(await readFile(lock, 'utf8')).toBe(ownerFlag)
			}
			owner.send('release')
			expect(await owner.next()).toEqual({ event: 'exited', code: 0 })
			expect(existsSync(lock)).toBe(false)
			const expired = await start('owner')
			expired.send('seed')
			expect(await expired.next()).toEqual({ event: 'held' })
			const expiredFlag = await readFile(lock, 'utf8')
			const staleTime = new Date(Date.now() - 301_000)
			await utimes(lock, staleTime, staleTime)
			const replacement = await start('owner')
			replacement.send('extract')
			expect(await replacement.next()).toEqual({ event: 'held' })
			const replacementFlag = await readFile(lock, 'utf8')
			expect(replacementFlag).not.toBe(expiredFlag)
			expired.send('release')
			expect(await expired.next()).toEqual({ event: 'exited', code: 0 })
			expect(await readFile(lock, 'utf8')).toBe(replacementFlag)
			replacement.send('exit')
			expect(await replacement.next()).toEqual({ event: 'exited', code: 0 })
			expect(existsSync(lock)).toBe(false)
		} finally {
			await Promise.all(workers.map((worker) => worker.terminate()))
			await rm(directory, { recursive: true, force: true })
		}
	})
})
