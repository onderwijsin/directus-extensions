import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

import { Command } from 'commander'
import pino from 'pino'

/** @typedef {(hooks: { init: (event: string, callback: (metadata: { program: Command }) => void) => void, action: (event: string, callback: (input: { payload: object }) => void) => void }, context: object) => void} Hook */

const [bundle, mode, directory] = process.argv.slice(2)
const program = new Command()
/** @type {Map<string, (input: { payload: object }) => void>} */
const actions = new Map()
/** @type {(() => void) | undefined} */
let release
let paused = false

/**
 * Sends a JSON protocol event to the owning test.
 * @param message - Serializable event.
 * @returns Nothing.
 */
function send(message) {
	process.stdout.write(`${JSON.stringify(message)}\n`)
}

/**
 * Reports exit after any acquisition-bound cleanup registered by the hook.
 * @param {number} code - Requested process exit status.
 * @returns {void} Nothing.
 */
function reportExit(code) {
	send({ event: 'exited', code })
}

const logger = pino(
	{ level: 'trace' },
	{
		write(line) {
			if (line.includes('Bulk operation active, skipping')) send({ event: 'skipped' })
		},
	},
)
/** @type {{ default: Hook }} */
const extension = await import(pathToFileURL(bundle).href)
extension.default(
	{
		init(event, callback) {
			if (event === 'cli.after') callback({ program })
		},
		action(event, callback) {
			actions.set(event, callback)
		},
	},
	{
		logger,
		env: {
			DEPLOYMENT_ENV: 'development',
			SEEDER_AUTO_EXTRACT: mode !== 'owner',
			SEEDER_INCLUDE: 'directus_translations',
			SEEDER_SEEDS_DIR: directory,
			SEEDER_ASSETS_DIR: `${directory}/assets`,
		},
		async getSchema() {
			process.off('exit', reportExit)
			process.on('exit', reportExit)
			if (mode === 'owner' && !paused) {
				paused = true
				await new Promise((resolve) => {
					release = () => resolve(undefined)
					send({ event: 'held' })
				})
			}
			return {}
		},
		services: {
			ItemsService: class {
				readByQuery() {
					if (mode !== 'owner') send({ event: 'unexpected-extraction' })
					return Promise.resolve([])
				}
			},
			UtilsService: class {
				clearCache() {
					return Promise.resolve()
				}
			},
		},
	},
)
process.on('exit', reportExit)
createInterface({ input: process.stdin }).on('line', (line) => {
	const command = JSON.parse(line)
	if (command === 'release') release?.()
	if (command === 'exit') process.exit(0)
	if (command === 'auto') actions.get('translations.create')?.({ payload: {} })
	if (command === 'seed' || command === 'extract') {
		void program
			.parseAsync(
				[
					'seed',
					command === 'seed' ? 'system' : 'extract',
					'--include',
					'directus_translations',
				],
				{ from: 'user' },
			)
			.catch((error) => {
				process.stderr.write(String(error))
				process.exit(1)
			})
	}
})
send({ event: 'ready' })
