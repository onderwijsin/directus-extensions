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

import { execFile } from 'node:child_process'

import { createDirectusE2EClient } from '../src/directus-e2e'

describe('Directus E2E client', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('sends authenticated item requests and unwraps response data', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { id: 1 } }), { status: 200 }),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { id: 1, title: 'updated' } }), {
					status: 200,
				}),
			)
			.mockResolvedValueOnce(new Response(null, { status: 204 }))

		const client = createDirectusE2EClient({
			baseUrl: 'http://directus.test',
			token: 'test-token',
			composeFiles: [],
			composeProject: 'test-project',
		})

		await expect(client.createItem('posts', { title: 'created' })).resolves.toEqual({ id: 1 })
		await expect(client.updateItem('posts', 1, { title: 'updated' })).resolves.toEqual({
			id: 1,
			title: 'updated',
		})
		await expect(client.deleteItem('posts', 1)).resolves.toBeUndefined()

		expect(fetchMock.mock.calls[0]?.[0]).toEqual(new URL('http://directus.test/items/posts'))
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
			method: 'POST',
			body: '{"title":"created"}',
		})
		const requestHeaders = fetchMock.mock.calls[0]?.[1]?.headers
		expect(requestHeaders).toBeInstanceOf(Headers)
		if (!(requestHeaders instanceof Headers)) throw new Error('Expected request headers')
		expect(requestHeaders.get('Authorization')).toBe('Bearer test-token')
		expect(requestHeaders.get('Content-Type')).toBe('application/json')
		expect(fetchMock.mock.calls[1]?.[0]).toEqual(new URL('http://directus.test/items/posts/1'))
		expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' })
	})

	it('reports Directus errors and unexpected empty responses', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const client = createDirectusE2EClient({
			baseUrl: 'http://directus.test',
			token: 'test-token',
			composeFiles: [],
			composeProject: 'test-project',
		})

		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ errors: [{ message: 'Forbidden' }] }), { status: 403 }),
		)
		await expect(client.request('/items/posts')).rejects.toThrow(
			'Directus 403: {"errors":[{"message":"Forbidden"}]}',
		)

		fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
		await expect(client.request('/items/posts')).rejects.toThrow(
			'Directus returned an empty response where JSON was expected',
		)
	})

	it('polls Compose logs until the requested event appears', async () => {
		const client = createDirectusE2EClient({
			baseUrl: 'http://directus.test',
			token: 'test-token',
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
