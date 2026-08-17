import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const e2eOperationTimeoutMs = 60_000

export interface DirectusE2EClientOptions {
	baseUrl: string
	token: string
	composeFiles: string[]
	composeProject: string
}

interface DirectusResponse<T> {
	data: T
}

export type DirectusE2ERequest = <T>(path: string, init?: RequestInit) => Promise<T>

export interface DirectusE2EClient {
	request<T>(path: string, init?: RequestInit): Promise<T>
	fetchAsAdmin<T>(path: string, init?: RequestInit): Promise<T>
	fetchAsUser<T>(
		userId: string,
		callback: (request: DirectusE2ERequest) => Promise<T>,
	): Promise<T>
	fetchAsRole<T>(
		roleId: string,
		callback: (request: DirectusE2ERequest) => Promise<T>,
	): Promise<T>
	createItem<T>(collection: string, item: Record<string, unknown>): Promise<T>
	updateItem<T>(
		collection: string,
		key: string | number,
		item: Record<string, unknown>,
	): Promise<T>
	deleteItem(collection: string, key: string | number): Promise<void>
	createPolicy<T>(policy: Record<string, unknown>): Promise<T>
	deletePolicy(policyId: string): Promise<void>
	createRole<T>(role: Record<string, unknown>): Promise<T>
	deleteRole(roleId: string): Promise<void>
	waitForLog(pattern: RegExp, timeoutMs?: number): Promise<string>
}

/**
 * Creates a small authenticated client for the isolated Directus E2E stack.
 * @param options - Connection and Compose details for the E2E stack.
 * @returns A client for authenticated item requests and log assertions.
 */
export function createDirectusE2EClient(options: DirectusE2EClientOptions): DirectusE2EClient {
	/**
	 * Builds the Directus items API path for a collection and optional key.
	 * @param collection - User collection name.
	 * @param key - Optional item primary key.
	 * @returns The encoded items API path.
	 */
	const itemPath = (collection: string, key?: string | number) =>
		`/items/${encodeURIComponent(collection)}${
			key === undefined ? '' : `/${encodeURIComponent(String(key))}`
		}`

	/**
	 * Sends a request using the supplied Directus token.
	 * @param token - Static token to use for the request.
	 * @param path - API path relative to the Directus base URL.
	 * @param init - Optional fetch request options.
	 * @param allowEmptyResponse - Whether a `204` response is valid.
	 * @returns The unwrapped Directus response data.
	 */
	async function requestWithToken<T>(token: string, path: string, init?: RequestInit): Promise<T>
	async function requestWithToken(
		token: string,
		path: string,
		init: RequestInit | undefined,
		allowEmptyResponse: true,
	): Promise<void>
	/**
	 * Implements token-authenticated requests for the public client helpers.
	 * @param token - Static token to use for the request.
	 * @param path - API path relative to the Directus base URL.
	 * @param init - Fetch request options.
	 * @param allowEmptyResponse - Whether a `204` response is valid.
	 * @returns The unwrapped response data, or nothing for an allowed empty response.
	 */
	async function requestWithToken<T>(
		token: string,
		path: string,
		init: RequestInit = {},
		allowEmptyResponse = false,
	): Promise<T | void> {
		const headers = new Headers(init.headers)
		headers.set('Authorization', `Bearer ${token}`)
		headers.set('Content-Type', 'application/json')

		const response = await fetch(new URL(path, options.baseUrl), {
			...init,
			headers,
			signal: init.signal ?? AbortSignal.timeout(e2eOperationTimeoutMs),
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
	 * Sends an authenticated request as the E2E admin user.
	 * @param path - API path relative to the Directus base URL.
	 * @param init - Optional fetch request options.
	 * @returns The unwrapped Directus response data.
	 */
	async function request<T>(path: string, init?: RequestInit): Promise<T> {
		return requestWithToken<T>(options.token, path, init)
	}

	/**
	 * Alias for an admin-authenticated request, useful when a test uses multiple identities.
	 * @param path - API path relative to the Directus base URL.
	 * @param init - Optional fetch request options.
	 * @returns The unwrapped Directus response data.
	 */
	async function fetchAsAdmin<T>(path: string, init?: RequestInit): Promise<T> {
		return request(path, init)
	}

	/**
	 * Runs a callback with a request function authenticated as a Directus user.
	 * @param userId - User primary key whose static token should be used.
	 * @param callback - Work to perform with the user-authenticated request function.
	 * @returns The callback result.
	 */
	async function fetchAsUser<T>(
		userId: string,
		callback: (request: DirectusE2ERequest) => Promise<T>,
	): Promise<T> {
		const user = await request<{ token: string | null }>(
			`/users/${encodeURIComponent(userId)}?fields=token`,
		)
		if (user.token === null || user.token.length === 0) {
			throw new Error(`Directus user ${userId} does not have a static token`)
		}
		const token = user.token
		/**
		 * Sends a request with the resolved user's static token.
		 * @param path - API path relative to the Directus base URL.
		 * @param init - Optional fetch request options.
		 * @returns The unwrapped Directus response data.
		 */
		const userRequest: DirectusE2ERequest = <T>(path: string, init?: RequestInit) =>
			requestWithToken<T>(token, path, init)

		return callback(userRequest)
	}

	/**
	 * Runs a callback with a request function authenticated as a user in a Directus role.
	 * @param roleId - Role primary key whose first assigned user's static token should be used.
	 * @param callback - Work to perform with the role-authenticated request function.
	 * @returns The callback result.
	 */
	async function fetchAsRole<T>(
		roleId: string,
		callback: (request: DirectusE2ERequest) => Promise<T>,
	): Promise<T> {
		const users = await request<{ id: string }[]>(
			`/users?filter[role][_eq]=${encodeURIComponent(roleId)}&fields=id&limit=1`,
		)
		const user = users[0]
		if (user === undefined) throw new Error(`Directus role ${roleId} has no assigned user`)

		return fetchAsUser(user.id, callback)
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
		await requestWithToken(options.token, itemPath(collection, key), { method: 'DELETE' }, true)
	}

	/**
	 * Creates a policy through Directus's dedicated policies endpoint.
	 * @param policy - Policy payload.
	 * @returns The created policy.
	 */
	async function createPolicy<T>(policy: Record<string, unknown>): Promise<T> {
		return request<T>('/policies', {
			method: 'POST',
			body: JSON.stringify(policy),
		})
	}

	/**
	 * Deletes a policy through Directus's dedicated policies endpoint.
	 * @param policyId - Policy primary key.
	 * @returns Nothing.
	 */
	async function deletePolicy(policyId: string): Promise<void> {
		await requestWithToken(
			options.token,
			'/policies',
			{ method: 'DELETE', body: JSON.stringify([policyId]) },
			true,
		)
	}

	/**
	 * Creates a role through Directus's dedicated roles endpoint.
	 * @param role - Role payload.
	 * @returns The created role.
	 */
	async function createRole<T>(role: Record<string, unknown>): Promise<T> {
		return request<T>('/roles', {
			method: 'POST',
			body: JSON.stringify(role),
		})
	}

	/**
	 * Deletes a role through Directus's dedicated roles endpoint.
	 * @param roleId - Role primary key.
	 * @returns Nothing.
	 */
	async function deleteRole(roleId: string): Promise<void> {
		await requestWithToken(
			options.token,
			'/roles',
			{ method: 'DELETE', body: JSON.stringify([roleId]) },
			true,
		)
	}

	/**
	 * Waits until the Directus container emits a matching log line.
	 * @param pattern - Regular expression to find in the container logs.
	 * @param timeoutMs - Maximum time to wait in milliseconds.
	 * @returns The complete matching log output.
	 */
	async function waitForLog(pattern: RegExp, timeoutMs = e2eOperationTimeoutMs): Promise<string> {
		const deadline = Date.now() + timeoutMs
		let output = ''

		while (Date.now() < deadline) {
			const result = await execFileAsync(
				'docker',
				[
					'compose',
					...options.composeFiles.flatMap((file) => ['-f', file]),
					'-p',
					options.composeProject,
					'logs',
					'--no-color',
					'directus',
				],
				{ timeout: e2eOperationTimeoutMs },
			)
			output = result.stdout
			pattern.lastIndex = 0
			if (pattern.test(output)) return output
			await new Promise((resolve) => setTimeout(resolve, 250))
		}

		throw new Error(`Timed out waiting for Directus log ${pattern}:\n${output}`)
	}

	return {
		request,
		fetchAsAdmin,
		fetchAsUser,
		fetchAsRole,
		createItem,
		updateItem,
		deleteItem,
		createPolicy,
		deletePolicy,
		createRole,
		deleteRole,
		waitForLog,
	}
}
