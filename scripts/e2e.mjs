/**
 * End-to-end runner for the repository's isolated Directus test project.
 *
 * Invoked by `pnpm test:e2e` and directly by the CI E2E job. It starts the Compose
 * stack, initializes the test data, runs Vitest, optionally prints diagnostics on
 * failure, and always removes the stack afterwards.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, chmod, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** @typedef {import('node:child_process').ChildProcessWithoutNullStreams} ChildProcess */
/** @typedef {import('node:child_process').SpawnOptions} SpawnOptions */
/** @typedef {SpawnOptions & {streamOutput?: boolean, timeoutMs?: number}} RunCommandOptions */
/** @typedef {{State?: string, ExitCode?: number}} ComposeService */
const composeFiles = ['docker/compose.yaml', 'tests/compose.e2e.yaml']
const e2eOperationTimeoutMs = 180_000
const composeCommandTimeout = 900_000
const composeCompletionTimeout = 300_000
const serviceReadinessTimeout = 180_000
const progressLogInterval = 5_000
const composeProject = `directus-extensions-e2e-${process.pid}`
const port = process.env.DIRECTUS_E2E_PORT ?? '18055'
const mailpitPort = process.env.DIRECTUS_E2E_MAILPIT_PORT ?? '18025'
const storagePort = process.env.DIRECTUS_E2E_STORAGE_PORT ?? '13900'
const searchPort = process.env.DIRECTUS_E2E_SEARCH_PORT ?? '17700'
const baseUrl = `http://127.0.0.1:${port}`
const email = 'admin@example.com'

/**
 * Determines whether the E2E runner should print Compose diagnostics.
 * @param {string[]} [args] - Command-line arguments to inspect.
 * @returns {boolean} Whether verbose diagnostics were requested.
 */
export function isVerbose(args = process.argv.slice(2)) {
	return args.includes('--verbose')
}

const verbose = isVerbose()

/**
 * Determines whether an HTTP response indicates that a service is ready.
 * @param {Response} response - HTTP response returned by the readiness probe.
 * @returns {boolean} Whether the response has a successful status.
 */
export const responseIsReady = (response) => response.ok
/** @type {ChildProcess | undefined} */
let activeChild
let interrupted = false

/**
 * Writes a timestamped message to the CI log.
 * @param message - Human-readable progress message.
 * @returns Nothing.
 */
function log(message) {
	console.log(`[e2e ${new Date().toISOString()}] ${message}`)
}

/**
 * Runs a child process while streaming its output and enforcing a timeout.
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments passed to the executable.
 * @param {RunCommandOptions} options - Child-process options and output behavior.
 * @returns {Promise<{stdout: string, stderr: string}>} The completed process result.
 */
function runCommand(
	command,
	args,
	{ streamOutput = true, timeoutMs = composeCommandTimeout, ...options } = {},
) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
		activeChild = child
		const stdout = []
		const stderr = []
		let timedOut = false
		const timer = setTimeout(() => {
			timedOut = true
			child.kill('SIGTERM')
		}, timeoutMs)

		child.stdout.on('data', (chunk) => {
			const output = String(chunk)
			stdout.push(output)
			if (streamOutput) process.stdout.write(output)
		})
		child.stderr.on('data', (chunk) => {
			const output = String(chunk)
			stderr.push(output)
			if (streamOutput) process.stderr.write(output)
		})
		child.on('error', (error) => {
			clearTimeout(timer)
			activeChild = undefined
			reject(error)
		})
		child.on('close', (code, signal) => {
			clearTimeout(timer)
			activeChild = undefined
			if (code === 0) {
				resolve({ stdout: stdout.join(''), stderr: stderr.join('') })
				return
			}
			const reason = timedOut
				? `timed out after ${timeoutMs / 1_000} seconds`
				: `exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`
			reject(new Error(`${command} ${args.join(' ')} ${reason}`))
		})
	})
}

/**
 * Generates secrets for one isolated E2E run.
 * @returns Environment variables shared by the E2E Compose services.
 */
export function generateEnvironmentSecrets() {
	/**
	 * Generates one cryptographically random secret for the Compose environment.
	 * @returns {string} A hexadecimal secret value.
	 */
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
		SENTRY_ENABLED: 'false',
	}
}

const environmentSecrets = generateEnvironmentSecrets()
const password = environmentSecrets.ADMIN_PASSWORD
const sourceExtensionsDirectory = resolve(process.env.DIRECTUS_E2E_EXTENSIONS_DIR ?? 'extensions')
const playgroundSourceDirectory = resolve(
	process.env.DIRECTUS_E2E_PLAYGROUND_DIR ?? 'tests/directus-e2e-playground',
)
let extensionsDirectory
let stagedExtensionsDirectory

/**
 * Creates the single extension tree mounted by E2E Compose.
 *
 * The Directus image has a read-only root filesystem. Mounting the playground as a
 * second nested bind mount therefore fails when Docker tries to create its target
 * directory. Staging it into the primary extension tree keeps the playground out
 * of development Compose while requiring only one Directus extension mount.
 *
 * @returns A promise completed after the staging tree is ready.
 */
async function prepareExtensionsDirectory() {
	stagedExtensionsDirectory = await mkdtemp(join(tmpdir(), 'directus-e2e-extensions-'))
	// mkdtemp creates 0700 directories, but Directus reads this bind mount as a non-root user.
	await chmod(stagedExtensionsDirectory, 0o755)
	await cp(sourceExtensionsDirectory, stagedExtensionsDirectory, { recursive: true })
	await stagePlayground({
		sourceExtensionsDirectory,
		playgroundSourceDirectory,
		stagedExtensionsDirectory,
	})
	extensionsDirectory = stagedExtensionsDirectory
}

/**
 * Adds the source playground when the extension tree does not already contain its packed build.
 *
 * @param {{sourceExtensionsDirectory: string, playgroundSourceDirectory: string, stagedExtensionsDirectory: string}} options - Playground staging paths.
 * @returns {Promise<boolean>} Whether the source playground was copied.
 */
export async function stagePlayground({
	sourceExtensionsDirectory: sourceDirectory,
	playgroundSourceDirectory: playgroundDirectory,
	stagedExtensionsDirectory: stagedDirectory,
}) {
	try {
		await access(join(sourceDirectory, 'directus-extension-e2e-playground', 'dist', 'index.js'))
		return !shouldStagePlayground(true)
	} catch {
		await cp(playgroundDirectory, join(stagedDirectory, 'directus-e2e-playground'), {
			recursive: true,
		})
		return shouldStagePlayground(false)
	}
}

/**
 * Determines whether the source playground should be added to the staged tree.
 * @param {boolean} hasPackedBuild - Whether the packed playground is already available.
 * @returns {boolean} Whether source staging is required.
 */
export function shouldStagePlayground(hasPackedBuild) {
	return !hasPackedBuild
}

/**
 * Runs Docker Compose for the isolated E2E project.
 * @param {string[]} args - Compose arguments.
 * @param {{logCommand?: boolean, streamOutput?: boolean, timeoutMs?: number}} options - Output and timeout behavior.
 * @returns {Promise<{stdout: string, stderr: string}>} The completed command output.
 */
async function compose(args, { logCommand = true, ...options } = {}) {
	const envFile = resolve('.env')
	const envFileArguments = []
	try {
		await access(envFile)
		// Explicitly load the repository-root .env without changing Compose path resolution.
		envFileArguments.push('--env-file', envFile)
	} catch {
		// CI can provide all required values through the process environment.
	}

	const command = [
		'compose',
		...envFileArguments,
		...composeFiles.flatMap((file) => ['-f', file]),
		'-p',
		composeProject,
		...args,
	]
	if (logCommand) log(`Starting: docker ${command.join(' ')}`)
	const result = await runCommand('docker', command, {
		env: {
			...process.env,
			...environmentSecrets,
			DIRECTUS_E2E_PORT: port,
			DIRECTUS_E2E_EXTENSIONS_DIR: extensionsDirectory,
		},
		timeoutMs: e2eOperationTimeoutMs,
		...options,
	})
	if (logCommand) log(`Completed: docker compose ${args.join(' ')}`)
	return result
}

/**
 * Waits until an HTTP service responds.
 * @param {string} url - Service endpoint to probe.
 * @param {string} name - Human-readable service name for timeout errors.
 * @param {(response: Response) => boolean} isReady - Predicate that determines whether the response is ready.
 * @returns {Promise<void>} Nothing.
 */
async function waitForHttp(url, name, isReady = responseIsReady) {
	const deadline = Date.now() + serviceReadinessTimeout
	let nextProgressLog = Date.now()
	log(`Waiting for ${name}: ${url}`)
	while (Date.now() < deadline) {
		if (interrupted) throw new Error('E2E run interrupted')
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(e2eOperationTimeoutMs),
			})
			if (isReady(response)) {
				log(`${name} is ready`)
				return
			}
		} catch {
			// The service is still starting.
		}
		if (Date.now() >= nextProgressLog) {
			log(`Still waiting for ${name}`)
			nextProgressLog = Date.now() + progressLogInterval
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000))
	}
	throw new Error(`Timed out waiting for ${name}`)
}

/**
 * Waits for a one-shot Compose service to exit successfully.
 * @param {string} service - Compose service name.
 * @returns {Promise<void>} Nothing.
 */
async function waitForComposeCompletion(service) {
	const deadline = Date.now() + composeCompletionTimeout
	let nextProgressLog = Date.now()
	log(`Waiting for Compose service ${service} to complete`)
	while (Date.now() < deadline) {
		if (interrupted) throw new Error('E2E run interrupted')
		const result = await compose(['ps', '--all', '--format', 'json', service], {
			logCommand: false,
			streamOutput: false,
		})
		const records = result.stdout
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => /** @type {ComposeService} */ (JSON.parse(line)))
		const record = records[0]
		const state = typeof record?.State === 'string' ? record.State.toLowerCase() : undefined
		if (state === 'exited') {
			if (record.ExitCode !== 0) {
				throw new Error(`${service} exited with code ${record.ExitCode}`)
			}
			log(`Compose service ${service} completed successfully`)
			return
		}
		if (Date.now() >= nextProgressLog) {
			log(`Still waiting for Compose service ${service}`)
			if (verbose) {
				await compose(['logs', '--no-color', '--tail', '50', service], {
					logCommand: false,
				})
			}
			nextProgressLog = Date.now() + progressLogInterval
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000))
	}
	throw new Error(`Timed out waiting for Compose service ${service}`)
}

/**
 * Waits until all externally observable E2E services respond.
 * @returns Nothing.
 */
async function waitForServices() {
	log('Waiting for externally observable services')
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
		signal: init.signal ?? AbortSignal.timeout(e2eOperationTimeoutMs),
	})
	/** @type {{data: unknown}} */
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
	if (!data || typeof data !== 'object' || !('access_token' in data)) {
		throw new Error('Directus login response did not include an access token')
	}
	if (typeof data.access_token !== 'string') {
		throw new Error('Directus login access token was not a string')
	}
	return data.access_token
}

/**
 * Runs the E2E Vitest project.
 * @param {string} token - Access token for the initialized Directus instance.
 * @returns {Promise<{stdout: string, stderr: string}>} The completed test command output.
 */
async function runTests(token) {
	log('Starting E2E Vitest project')
	return runCommand('corepack', ['pnpm', 'exec', 'vitest', 'run', '--project', 'e2e'], {
		env: {
			...process.env,
			DIRECTUS_E2E_URL: baseUrl,
			DIRECTUS_E2E_TOKEN: token,
			DIRECTUS_E2E_COMPOSE_FILES: JSON.stringify(composeFiles),
			DIRECTUS_E2E_COMPOSE_PROJECT: composeProject,
		},
		timeoutMs: e2eOperationTimeoutMs,
	})
}

/**
 * Registers signal handlers that let the normal finally block clean up Compose resources.
 * @returns Nothing.
 */
function registerSignalHandlers() {
	for (const [signal, exitCode] of [
		['SIGINT', 130],
		['SIGTERM', 143],
	]) {
		process.once(signal, () => {
			interrupted = true
			process.exitCode = exitCode
			log(`Received ${signal}; stopping the active child process and cleaning up`)
			activeChild?.kill('SIGTERM')
		})
	}
}

/**
 * Removes the E2E Compose project and its disposable volumes.
 * @returns Nothing.
 */
async function cleanup() {
	log('Cleaning up E2E Compose resources')
	await compose(['down', '--volumes', '--remove-orphans'], {
		timeoutMs: e2eOperationTimeoutMs,
	})
	log('E2E cleanup completed')
	if (stagedExtensionsDirectory) {
		await rm(stagedExtensionsDirectory, { recursive: true, force: true })
		stagedExtensionsDirectory = undefined
		extensionsDirectory = undefined
	}
}

/**
 * Runs the complete isolated E2E lifecycle.
 * @returns {Promise<void>} Nothing.
 */
export async function main() {
	registerSignalHandlers()
	try {
		await prepareExtensionsDirectory()
		log(`Starting E2E run for project ${composeProject}`)
		log(`Compose files: ${composeFiles.join(', ')}`)
		log(`Directus endpoint: ${baseUrl}`)
		// Start from a clean project so stale containers or database volumes cannot affect the run.
		log('Removing stale Compose resources')
		await compose(['down', '--volumes', '--remove-orphans'], {
			timeoutMs: e2eOperationTimeoutMs,
		})
		log('Starting Compose services; readiness probes will report progress')
		await compose(['up', '-d'], { timeoutMs: composeCommandTimeout })
		await waitForComposeCompletion('garage-init')
		await waitForServices()
		log('Authenticating against Directus')
		const token = await login()
		await runTests(token)
		log(interrupted ? 'E2E run interrupted' : 'E2E tests completed successfully')
	} catch (error) {
		console.error(`[e2e ${new Date().toISOString()}] E2E run failed`, error)
		if (verbose) {
			// Service logs are the most useful startup/test failure diagnostic available from Compose.
			try {
				log('Collecting Compose service logs')
				const logs = await compose(['logs', '--no-color'], { streamOutput: false })
				console.error(logs.stdout)
			} catch (logError) {
				console.error(logError)
			}
		} else {
			console.error(
				'[e2e] Compose service logs suppressed; rerun with `pnpm test:e2e -- --verbose` for diagnostics',
			)
		}
		process.exitCode = 1
	} finally {
		// Cleanup runs for both passing and failing tests, including failed startup attempts.
		try {
			await cleanup()
		} catch (error) {
			console.error(error)
			process.exitCode = 1
		}
	}
}

if (import.meta.main) await main()
