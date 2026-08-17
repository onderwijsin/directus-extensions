/// <reference types="node" />

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
	execFile: vi.fn((...args: unknown[]) => {
		const callback = args.at(-1)
		if (typeof callback === 'function')
			Reflect.apply(callback, null, [
				null,
				{ stdout: 'directus-e2e-playground log', stderr: '' },
			])
	}),
}))

const { fetchMock } = vi.hoisted(() => {
	const fetchMock = vi.fn()
	vi.stubGlobal('fetch', fetchMock)
	return { fetchMock }
})

import { execFile } from 'node:child_process'

import { createDirectusE2EClient, createItem, deleteItem } from '../src'

describe('Directus E2E SDK client', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('uses the official SDK for root-authenticated item requests', async () => {
		fetchMock.mockReset()
		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { id: 1 } }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			)
			.mockResolvedValueOnce(new Response(null, { status: 204 }))

		const client = createDirectusE2EClient({
			baseUrl: 'http://directus.test',
			token: 'root-token',
			composeFiles: [],
			composeProject: 'test-project',
		})

		await expect(client.request(createItem('posts', { title: 'created' }))).resolves.toEqual({
			id: 1,
		})
		await expect(client.request(deleteItem('posts', 1))).resolves.toBeNull()

		const headers = fetchMock.mock.calls[0]?.[1]?.headers
		expect(headers).toMatchObject({ Authorization: 'Bearer root-token' })
	})

	it('creates an isolated SDK client for user context', async () => {
		fetchMock.mockReset()
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ data: { token: 'user-token' } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}),
		)

		const client = createDirectusE2EClient({
			baseUrl: 'http://directus.test',
			token: 'root-token',
			composeFiles: [],
			composeProject: 'test-project',
		})

		await expect(
			client.withUserContext('user-id', async (userClient) => userClient.getToken()),
		).resolves.toBe('user-token')
		await expect(client.getToken()).resolves.toBe('root-token')
	})

	it('polls Compose logs until the requested event appears', async () => {
		const client = createDirectusE2EClient({
			baseUrl: 'http://directus.test',
			token: 'root-token',
			composeFiles: ['docker/compose.yaml', 'tests/compose.e2e.yaml'],
			composeProject: 'test-project',
		})

		await expect(client.waitForLog(/directus-e2e-playground log/u)).resolves.toBe(
			'directus-e2e-playground log',
		)
		expect(execFile).toHaveBeenCalledWith(
			'docker',
			[
				'compose',
				'-f',
				'docker/compose.yaml',
				'-f',
				'tests/compose.e2e.yaml',
				'-p',
				'test-project',
				'logs',
				'--no-color',
				'directus',
			],
			{ timeout: 60_000 },
			expect.any(Function),
		)
	})
})
