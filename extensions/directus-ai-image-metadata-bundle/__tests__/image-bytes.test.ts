import { Readable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { readImageBytes } from '../src/shared/image-bytes'

describe('bounded private image reads', () => {
	it('collects multiple chunks and closes the source', async () => {
		const source = Readable.from([Buffer.from([1, 2]), Buffer.from([3])])
		await expect(readImageBytes(source, new AbortController().signal, 3)).resolves.toEqual(
			Buffer.from([1, 2, 3]),
		)
		expect(source.destroyed).toBe(true)
	})
	it('rejects oversized images and releases the stream', async () => {
		const source = Readable.from([Buffer.from([1, 2, 3])])
		await expect(readImageBytes(source, new AbortController().signal, 2)).rejects.toMatchObject(
			{ code: 'INVALID_PAYLOAD' },
		)
		expect(source.destroyed).toBe(true)
	})
	it('rejects empty images and unexpected chunk types', async () => {
		for (const chunks of [[], ['text']]) {
			const source = Readable.from(chunks)
			await expect(
				readImageBytes(source, new AbortController().signal, 10),
			).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' })
			expect(source.destroyed).toBe(true)
		}
	})
	it('aborts the read and releases the stream', async () => {
		const source = new Readable({
			read() {
				// Intentionally wait for external cancellation without producing bytes.
			},
		})
		const controller = new AbortController()
		const result = readImageBytes(source, controller.signal, 10)
		controller.abort()
		await expect(result).rejects.toMatchObject({ name: 'AbortError' })
		expect(source.destroyed).toBe(true)
	})
})
