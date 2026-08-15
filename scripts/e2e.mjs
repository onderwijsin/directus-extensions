import { execFile } from 'node:child_process'
/**
 * End-to-end runner for the repository's isolated Directus test project.
 *
 * Invoked by `pnpm e2e` and directly by the CI E2E job. It starts the Compose
 * stack, initializes the test data, runs Vitest, prints diagnostics on failure,
 * and always removes the stack afterwards.
 */
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const composeFiles = ['compose.yaml', 'tests/compose.e2e.yaml']
const composeProject = `directus-extensions-e2e-${process.pid}`
const port = process.env.DIRECTUS_E2E_PORT ?? '18055'
const mailpitPort = process.env.DIRECTUS_E2E_MAILPIT_PORT ?? '18025'
const storagePort = process.env.DIRECTUS_E2E_STORAGE_PORT ?? '13900'
const searchPort = process.env.DIRECTUS_E2E_SEARCH_PORT ?? '17700'
const baseUrl = `http://127.0.0.1:${port}`
const email = 'admin@example.com'

/**
 * Generates secrets for one isolated E2E run.
 * @returns Environment variables shared by the E2E Compose services.
 */
function generateEnvironmentSecrets() {
	const randomSecret = () => randomBytes(32).toString('hex')

	return {
		DEFAULT_PASSWORD: randomSecret(),
		DIRECTUS_SECRET: randomSecret(),
		ADMIN_PASSWORD: randomSecret(),
		GARAGE_ACCESS_KEY_ID: `GK${randomBytes(12).toString('hex')}`,
		GARAGE_SECRET_ACCESS_KEY: randomSecret(),
		GARAGE_RPC_SECRET: randomSecret(),
		GARAGE_ADMIN_TOKEN: randomSecret(),
		GARAGE_METRICS_TOKEN: randomSecret(),
		MEILISEARCH_MASTER_KEY: randomSecret(),
	}
}

const environmentSecrets = generateEnvironmentSecrets()
const password = environmentSecrets.ADMIN_PASSWORD

/**
 * Checks whether an HTTP response indicates readiness.
 * @param response - HTTP response from the service probe.
 * @returns Whether the response is successful.
 */
function responseIsReady(response) {
	return response.ok
}

/**
 * Runs Docker Compose for the isolated E2E project.
 * @param args - Compose arguments.
 * @returns The completed command output.
 */
async function compose(args) {
	return execFileAsync(
		'docker',
		['compose', ...composeFiles.flatMap((file) => ['-f', file]), '-p', composeProject, ...args],
		{
			env: { ...process.env, ...environmentSecrets, DIRECTUS_E2E_PORT: port },
		},
	)
}

/**
 * Waits until an HTTP service responds.
 * @param url - Service endpoint to probe.
 * @param name - Human-readable service name for timeout errors.
 * @param isReady - Predicate that determines whether the response is ready.
 * @returns Nothing.
 */
async function waitForHttp(url, name, isReady = responseIsReady) {
	const deadline = Date.now() + 120_000
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url)
			if (isReady(response)) return
		} catch {
			// The service is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000))
	}
	throw new Error(`Timed out waiting for ${name}`)
}

/**
 * Waits until all externally observable E2E services respond.
 * @returns Nothing.
 */
async function waitForServices() {
	await waitForHttp(`${baseUrl}/server/ping`, 'Directus health')
	await waitForHttp(`http://127.0.0.1:${searchPort}/health`, 'Meilisearch health')
	await waitForHttp(
		`http://127.0.0.1:${storagePort}/`,
		'Garage S3 API',
		(response) => response.status < 500,
	)
	await waitForHttp(`http://127.0.0.1:${mailpitPort}/`, 'Mailpit health')
}

/**
 * Sends a JSON request to the Directus API.
 * @param path - API path.
 * @param init - Fetch options.
 * @returns The unwrapped response data.
 */
async function request(path, init = {}) {
	const response = await fetch(`${baseUrl}${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', ...init.headers },
	})
	const body = await response.json()
	if (!response.ok) throw new Error(`Directus ${response.status}: ${JSON.stringify(body)}`)
	return body.data
}

/**
 * Logs in with the configured E2E administrator.
 * @returns The access token.
 */
async function login() {
	const data = await request('/auth/login', {
		method: 'POST',
		body: JSON.stringify({ email, password }),
	})
	return data.access_token
}

/**
 * Creates the user collection used by the E2E tests.
 * @param token - Directus access token.
 * @returns Nothing.
 */
async function createPostsCollection(token) {
	/**
	 * Sends an authenticated request to Directus.
	 * @param path - API path.
	 * @param init - Fetch options.
	 * @returns The unwrapped response data.
	 */
	const authenticated = (path, init = {}) =>
		request(path, {
			...init,
			headers: { Authorization: `Bearer ${token}`, ...init.headers },
		})

	await authenticated('/collections', {
		method: 'POST',
		body: JSON.stringify({
			collection: 'posts',
			meta: { icon: 'article', note: 'Created for Directus extension E2E tests' },
			schema: {},
		}),
	})
	await authenticated('/fields/posts', {
		method: 'POST',
		body: JSON.stringify({
			field: 'title',
			type: 'string',
			meta: { interface: 'input', required: true },
			schema: { is_nullable: false },
		}),
	})
}

/**
 * Runs the E2E Vitest project.
 * @returns The completed test command output.
 * @param token - Access token for the initialized Directus instance.
 */
async function runTests(token) {
	/** @type {import('node:child_process').ExecFileOptions} */
	return execFileAsync('corepack', ['pnpm', 'exec', 'vitest', 'run', '--project', 'e2e'], {
		env: {
			...process.env,
			DIRECTUS_E2E_URL: baseUrl,
			DIRECTUS_E2E_TOKEN: token,
			DIRECTUS_E2E_COMPOSE_FILES: JSON.stringify(composeFiles),
			DIRECTUS_E2E_COMPOSE_PROJECT: composeProject,
		},
		stdio: 'inherit',
	})
}

try {
	// Start from a clean project so stale containers or database volumes cannot affect the run.
	await compose(['down', '--volumes', '--remove-orphans'])
	await compose(['up', '-d', '--wait'])
	await waitForServices()
	// Seed the shared test collection before handing control to the E2E Vitest project.
	const token = await login()
	await createPostsCollection(token)
	await runTests(token)
} catch (error) {
	console.error(error)
	// Service logs are the most useful startup/test failure diagnostic available from Compose.
	try {
		const logs = await compose(['logs', '--no-color'])
		console.error(logs.stdout)
	} catch (logError) {
		console.error(logError)
	}
	process.exitCode = 1
} finally {
	// Cleanup runs for both passing and failing tests, including failed startup attempts.
	try {
		await compose(['down', '--volumes', '--remove-orphans'])
	} catch (error) {
		console.error(error)
		process.exitCode = 1
	}
}
