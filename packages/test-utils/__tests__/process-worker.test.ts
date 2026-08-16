import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { createProcessWorker } from '../src/process-worker'

describe('createProcessWorker', () => {
	const workers: { terminate: () => Promise<void> }[] = []

	afterEach(async () => {
		await Promise.all(workers.splice(0).map((worker) => worker.terminate()))
	})

	it('sends JSON commands and receives JSON messages', async () => {
		const worker = createProcessWorker<{ echo: { value: number } }>({
			script: fileURLToPath(new URL('./fixtures/echo-worker.mjs', import.meta.url)),
		})
		workers.push(worker)

		worker.send({ value: 42 })

		expect(await worker.next()).toEqual({ echo: { value: 42 } })
	})
})
