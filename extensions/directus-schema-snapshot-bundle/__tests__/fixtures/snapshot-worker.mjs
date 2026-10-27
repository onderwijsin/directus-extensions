import fs from 'node:fs/promises'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

import { Command } from 'commander'
import pino from 'pino'

/** @typedef {{ hooks: { name: string; config: (functions: { init: (event: string, handler: (metadata: { program: Command }) => void) => void }, context: object) => void }[] }} Bundle */
/** @typedef {{ op?: string; pauseAt?: string; args: string[]; forceDiffs?: number; failWrite?: boolean }} WorkerCommand */

const [bundlePath, directory] = process.argv.slice(2)
let pauseAt
/** @type {(() => void) | undefined} */
let release
let failWrite = false
let diffCalls = 0
let applications = 0
let forceDiffs = 0
const snapshot = {
	version: 1,
	directus: '12.2.0',
	vendor: 'sqlite',
	collections: [],
	fields: [],
	relations: [],
	systemFields: [{ collection: 'directus_files', field: 'title', schema: { is_indexed: true } }],
}

/**
 * Sends one worker event over the test protocol.
 * @param message - JSON response to the parent.
 * @returns Nothing.
 */
function send(message) {
	process.stdout.write(`${JSON.stringify(message)}\n`)
}

/**
 * Holds a real operation at an explicit barrier until the parent releases it.
 * @param point - Operation boundary reached by the worker.
 * @returns A promise resolved by the release command.
 */
async function pause(point) {
	if (pauseAt !== point) return
	pauseAt = undefined
	/** @type {Promise<void>} */
	const waiting = new Promise((resolve) => {
		release = resolve
		send({ event: 'paused', point })
	})
	await waiting
}

// Keep real filesystem writes, with a deterministic barrier before the first definition.
const writeFile = fs.writeFile
fs.writeFile = async (filename, ...args) => {
	if (
		typeof filename === 'string' &&
		filename.endsWith('.yml') &&
		path.basename(filename) !== 'metadata.yml'
	) {
		await pause('definition')
		if (failWrite) throw new Error('injected definition write failure')
	}
	return writeFile(filename, ...args)
}
syncBuiltinESMExports()

// Licensing belongs to the Directus host; isolate it from the filesystem/CLI regression.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '@directus/api/license/index') {
			return {
				url: 'data:text/javascript,export function getLicenseManager() { return { initialize: async () => {} } }',
				shortCircuit: true,
			}
		}
		return nextResolve(specifier, context)
	},
})

/** @type {Bundle} */
const { hooks } = await import(pathToFileURL(bundlePath).href)
const program = new Command()
const logger = pino({ level: 'silent' })
const context = {
	env: { SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER: directory },
	logger,
	getSchema: () => Promise.resolve({}),
	services: {
		SchemaService: class {
			snapshot() {
				return Promise.resolve(snapshot)
			}

			async diff(target) {
				diffCalls++
				await pause('diff')
				await pause(`diff:${diffCalls}`)
				if (diffCalls <= forceDiffs) {
					return { collections: [], fields: [], relations: [], systemFields: [{}] }
				}
				if (applications > 0) return null
				// Missing definitions mean destructive removals, just as in Directus.
				return target.systemFields.length === 0
					? { collections: [], fields: [], relations: [], systemFields: [{}] }
					: null
			}

			async apply() {
				applications++
				await pause('apply')
			}
		},
	},
}

for (const hook of hooks) {
	if (hook.name !== 'cli-hook') continue
	hook.config(
		{
			init: (event, handler) => {
				if (event === 'cli.after') handler({ program })
			},
		},
		context,
	)
}

/**
 * Handles run and release commands while allowing a held operation to resume.
 * @param {string} line - One JSON command from the test.
 * @returns {Promise<void>} Resolves after the command completes.
 */
async function handleLine(line) {
	/** @type {WorkerCommand} */
	const command = JSON.parse(line)
	if (command.op === 'release') {
		release?.()
		return
	}
	pauseAt = command.pauseAt
	failWrite = command.failWrite ?? false
	diffCalls = 0
	applications = 0
	forceDiffs = command.forceDiffs ?? 0
	process.exitCode = 0
	await program.parseAsync(['schema-split', ...command.args], { from: 'user' })
	send({ event: 'done', exitCode: process.exitCode, diffCalls, applications })
}
createInterface({ input: process.stdin }).on('line', (line) => {
	void handleLine(line).catch((error) => {
		process.stderr.write(String(error))
		process.exit(1)
	})
})
send({ event: 'ready', pid: process.pid })
