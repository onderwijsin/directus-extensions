import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface DirectusE2EClientOptions {
	baseUrl: string
	token: string
	composeFiles: string[]
	composeProject: string
}

interface DirectusResponse<T> {
	data: T
}

export interface DirectusE2EClient {
	request<T>(path: string, init?: RequestInit): Promise<T>
	createItem<T>(collection: string, item: Record<string, unknown>): Promise<T>
	updateItem<T>(
		collection: string,
		key: string | number,
		item: Record<string, unknown>,
	): Promise<T>
	deleteItem(collection: string, key: string | number): Promise<void>
	waitForLog(pattern: RegExp, timeoutMs?: number): Promise<string>
}

/**
 * Creates a small authenticated client for the isolated Directus E2E stack.
 * @param options - Connection and Compose details for the E2E stack.
 * @returns A client for authenticated item requests and log assertions.
 */
export function createDirectusE2EClient(options: DirectusE2EClientOptions): DirectusE2EClient {
	const itemPath = (collection: string, key?: string | number) =>
		`/items/${encodeURIComponent(collection)}${
			key === undefined ? '' : `/${encodeURIComponent(String(key))}`
		}`

	/**
	 * Sends an authenticated request to Directus.
	 * @param path - API path relative to the Directus base URL.
	 * @param init - Optional fetch request options.
	 * @returns The unwrapped Directus response data.
	 */
	async function request<T>(path: string, init?: RequestInit): Promise<T>
	async function request(
		path: string,
		init: RequestInit | undefined,
		allowEmptyResponse: true,
	): Promise<void>
	async function request<T>(
		path: string,
		init: RequestInit = {},
		allowEmptyResponse = false,
	): Promise<T | void> {
		const headers = new Headers(init.headers)
		headers.set('Authorization', `Bearer ${options.token}`)
		headers.set('Content-Type', 'application/json')

		const response = await fetch(new URL(path, options.baseUrl), {
			...init,
			headers,
		})

		if (response.status === 204) {
			if (allowEmptyResponse) return
			throw new Error('Directus returned an empty response where JSON was expected')
		}

		const body = (await response.json()) as DirectusResponse<T> | { errors?: unknown }
		if (!response.ok) {
			throw new Error(`Directus ${response.status}: ${JSON.stringify(body)}`)
		}

		return 'data' in body ? body.data : undefined
	}

	/**
	 * Creates an item in a user collection.
	 * @param collection - User collection name.
	 * @param item - Item payload.
	 * @returns The created item.
	 */
	async function createItem<T>(collection: string, item: Record<string, unknown>): Promise<T> {
		return request<T>(itemPath(collection), {
			method: 'POST',
			body: JSON.stringify(item),
		})
	}

	/**
	 * Updates an item in a user collection.
	 * @param collection - User collection name.
	 * @param key - Primary key of the item.
	 * @param item - Partial item payload.
	 * @returns The updated item.
	 */
	async function updateItem<T>(
		collection: string,
		key: string | number,
		item: Record<string, unknown>,
	): Promise<T> {
		return request<T>(itemPath(collection, key), {
			method: 'PATCH',
			body: JSON.stringify(item),
		})
	}

	/**
	 * Deletes an item from a user collection.
	 * @param collection - User collection name.
	 * @param key - Primary key of the item.
	 * @returns Nothing.
	 */
	async function deleteItem(collection: string, key: string | number): Promise<void> {
		await request(itemPath(collection, key), { method: 'DELETE' }, true)
	}

	/**
	 * Waits until the Directus container emits a matching log line.
	 * @param pattern - Regular expression to find in the container logs.
	 * @param timeoutMs - Maximum time to wait in milliseconds.
	 * @returns The complete matching log output.
	 */
	async function waitForLog(pattern: RegExp, timeoutMs = 15_000): Promise<string> {
		const deadline = Date.now() + timeoutMs
		let output = ''

		while (Date.now() < deadline) {
			const result = await execFileAsync('docker', [
				'compose',
				...options.composeFiles.flatMap((file) => ['-f', file]),
				'-p',
				options.composeProject,
				'logs',
				'--no-color',
				'directus',
			])
			output = result.stdout
			pattern.lastIndex = 0
			if (pattern.test(output)) return output
			await new Promise((resolve) => setTimeout(resolve, 250))
		}

		throw new Error(`Timed out waiting for Directus log ${pattern}:\n${output}`)
	}

	return { request, createItem, updateItem, deleteItem, waitForLog }
}
