/**
 * End-to-end runner for the repository's isolated Directus test project.
 *
 * Invoked by `pnpm test:e2e` and directly by the CI E2E job. It starts the Compose
 * stack, initializes the test data, runs Vitest, and always removes the stack afterwards.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, chmod, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** @typedef {import('node:child_process').ChildProcessWithoutNullStreams} ChildProcess */
/** @typedef {import('node:child_process').SpawnOptions} SpawnOptions */
/** @typedef {SpawnOptions & {streamOutput?: boolean, timeoutMs?: number, killGraceMs?: number, forceKillSettleMs?: number}} RunCommandOptions */
const composeFiles = ['docker/compose.yaml', 'tests/compose.e2e.yaml']
const e2eOperationTimeoutMs = 180_000
const composeCommandTimeout = 900_000
const composeProject = `directus-extensions-e2e-${process.pid}-${randomBytes(4).toString('hex')}`
const port = process.env.DIRECTUS_E2E_PORT ?? '18055'
const mailpitPort = process.env.DIRECTUS_E2E_MAILPIT_PORT ?? '18025'
const baseUrl = `http://127.0.0.1:${port}`
const email = 'admin@example.com'
const childKillGraceMs = 1_000
const forceKillSettleMs = 1_000

/** @type {ChildProcess | undefined} */
let activeChild
let activeKillTimer
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
 * @returns {Promise<void>} A promise completed when the process exits successfully.
 */
export function runCommand(
	command,
	args,
	{
		streamOutput = true,
		timeoutMs = composeCommandTimeout,
		killGraceMs = childKillGraceMs,
		forceKillSettleMs: forceKillSettleDelayMs = forceKillSettleMs,
		...options
	} = {},
) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
		activeChild = child
		let timedOut = false
		let settled = false
		let forceKillTimer
		/**
		 * Settles the command exactly once.
		 * @param {() => void} callback - Settlement callback.
		 * @returns {void} Nothing.
		 */
		const settle = (callback) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			clearTimeout(forceKillTimer)
			if (activeKillTimer) clearTimeout(activeKillTimer)
			activeKillTimer = undefined
			activeChild = undefined
			callback()
		}
		/**
		 * Force-kills the child after the graceful termination window.
		 * @returns {void} Nothing.
		 */
		const forceKill = () => {
			if (settled) return
			child.kill('SIGKILL')
			// A descendant can keep the stdio pipes open after the direct child exits.
			// Settle independently so a hostile process tree cannot hold the runner open.
			forceKillTimer = setTimeout(() => {
				settle(() =>
					reject(
						new Error(
							`${command} ${args.join(' ')} timed out after ${timeoutMs / 1_000} seconds`,
						),
					),
				)
			}, forceKillSettleDelayMs)
		}
		/**
		 * Starts graceful termination and schedules force-kill escalation.
		 * @returns {void} Nothing.
		 */
		const terminate = () => {
			if (settled) return
			child.kill('SIGTERM')
			forceKillTimer = setTimeout(forceKill, killGraceMs)
		}
		const timer = setTimeout(() => {
			timedOut = true
			terminate()
		}, timeoutMs)

		child.stdout.on('data', (chunk) => {
			const output = String(chunk)
			if (streamOutput) process.stdout.write(output)
		})
		child.stderr.on('data', (chunk) => {
			const output = String(chunk)
			if (streamOutput) process.stderr.write(output)
		})
		child.on('error', (error) => {
			settle(() => reject(error))
		})
		child.on('close', (code, signal) => {
			settle(() => {
				if (code === 0) {
					resolve()
					return
				}
				const reason = timedOut
					? `timed out after ${timeoutMs / 1_000} seconds`
					: `exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`
				reject(new Error(`${command} ${args.join(' ')} ${reason}`))
			})
		})
	})
}

/**
 * Stops the currently running child without allowing it to block cleanup.
 * @returns Nothing.
 */
function stopActiveChild() {
	if (!activeChild) return
	activeChild.kill('SIGTERM')
	if (activeKillTimer) clearTimeout(activeKillTimer)
	activeKillTimer = setTimeout(() => {
		activeChild?.kill('SIGKILL')
	}, childKillGraceMs)
}

/**
 * Handles an interrupt while leaving the lifecycle finally block in control.
 * @param {string} signal - Signal received by the runner.
 * @param {boolean} setExitCode - Whether to set the process exit code.
 * @returns Nothing.
 */
export function handleInterrupt(signal = 'SIGTERM', setExitCode = true) {
	interrupted = true
	if (setExitCode) process.exitCode = signal === 'SIGINT' ? 130 : 143
	log(`Received ${signal}; stopping the active child process and cleaning up`)
	stopActiveChild()
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
 * @returns {Promise<void>} A promise completed when Compose exits successfully.
 */
async function compose(args, { logCommand = true, ...options } = {}) {
	const command = [
		'compose',
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
			DIRECTUS_E2E_MAILPIT_PORT: mailpitPort,
			DIRECTUS_E2E_EXTENSIONS_DIR: extensionsDirectory,
		},
		timeoutMs: e2eOperationTimeoutMs,
		...options,
	})
	if (logCommand) log(`Completed: docker compose ${args.join(' ')}`)
	return result
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
			DIRECTUS_E2E_MAILPIT_PORT: mailpitPort,
		},
		timeoutMs: e2eOperationTimeoutMs,
	})
}

/**
 * Applies the full repository migration path after extension startup has provisioned collections.
 *
 * @returns {Promise<void>} A promise completed when all migrations have been applied.
 */
async function runPostStartupMigrations() {
	log('Applying post-startup Directus migrations')
	await compose(
		[
			'exec',
			'-T',
			'-e',
			'MIGRATIONS_PATH=/directus/migrations',
			'directus',
			'node',
			'/directus/cli.js',
			'database',
			'migrate:latest',
		],
		{ timeoutMs: e2eOperationTimeoutMs },
	)
}

/**
 * Registers signal handlers that let the normal finally block clean up Compose resources.
 * @returns Nothing.
 */
function registerSignalHandlers() {
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.once(signal, () => {
			handleInterrupt(signal)
		})
	}
}

/**
 * Returns the only Docker cleanup operation this runner is allowed to perform.
 * @returns {string[]} Project-scoped Compose cleanup arguments.
 */
export function cleanupComposeArguments() {
	return ['down', '--volumes', '--remove-orphans']
}

/**
 * Removes the E2E Compose project and its disposable volumes.
 * @returns Nothing.
 */
async function cleanup() {
	log('Cleaning up E2E Compose resources')
	try {
		await compose(cleanupComposeArguments(), { timeoutMs: e2eOperationTimeoutMs })
		log('E2E Compose cleanup completed')
	} finally {
		if (stagedExtensionsDirectory) {
			await rm(stagedExtensionsDirectory, { recursive: true, force: true })
			stagedExtensionsDirectory = undefined
			extensionsDirectory = undefined
		}
	}
}

/**
 * Runs the complete isolated E2E lifecycle.
 * @returns {Promise<void>} Nothing.
 */
export async function main() {
	registerSignalHandlers()
	let originalError
	let cleanupError
	try {
		await prepareExtensionsDirectory()
		log(`Starting E2E run for project ${composeProject}`)
		await compose(['up', '-d', '--wait', '--wait-timeout', '180'], {
			timeoutMs: composeCommandTimeout,
		})
		await runPostStartupMigrations()
		log('Authenticating against Directus')
		const token = await login()
		await runTests(token)
		log(interrupted ? 'E2E run interrupted' : 'E2E tests completed successfully')
	} catch (error) {
		originalError = error
		process.exitCode = 1
	} finally {
		try {
			await cleanup()
		} catch (error) {
			cleanupError = error
		}
		if (cleanupError) process.exitCode = 1
		if (originalError) {
			console.error(`[e2e ${new Date().toISOString()}] E2E run failed`, originalError)
			if (cleanupError) console.error('[e2e] E2E cleanup failed', cleanupError)
		}
		if (cleanupError) {
			console.error(
				`[e2e] Cleanup is unverified for project ${composeProject}. Command: docker compose ${composeFiles.map((file) => `-f ${file}`).join(' ')} -p ${composeProject} ${cleanupComposeArguments().join(' ')}`,
			)
		}
	}
}

if (import.meta.main) await main()
