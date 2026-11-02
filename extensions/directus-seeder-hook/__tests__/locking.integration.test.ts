import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createProcessWorker } from '@workspace/test-utils'
import { describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./fixtures/lock-worker.mjs', import.meta.url))
const bundle = fileURLToPath(new URL('../dist/index.js', import.meta.url))

describe('built seeder process lock', () => {
	it('makes auto-extraction skip another CLI process and releases the owner lock after completion', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'seeder-process-'))
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
			const owner = await start('owner')
			owner.send('seed')
			expect(await owner.next()).toEqual({ event: 'held' })
			expect(existsSync(lock)).toBe(true)
			const contender = await start('auto')
			contender.send('auto')
			expect(await contender.next()).toEqual({ event: 'skipped' })
			expect(existsSync(lock)).toBe(true)
			owner.send('release')
			expect(await owner.next()).toEqual({ event: 'exited', code: 0 })
			expect(existsSync(lock)).toBe(false)
		} finally {
			await Promise.all(workers.map((worker) => worker.terminate()))
			await rm(directory, { recursive: true, force: true })
		}
	})
})
