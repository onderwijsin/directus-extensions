import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

const [distPath, mode, directory] = process.argv.slice(2)
const extensionUtils = await import(pathToFileURL(distPath).href)
const provider =
	mode === 'lock'
		? extensionUtils.createFsLockProvider({ directory })
		: extensionUtils.createFsMarkerStore({ directory })
let lease

const respond = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
const input = createInterface({ input: process.stdin })

input.on('line', async (line) => {
	try {
		const command = JSON.parse(line)
		if (mode === 'lock' && command.op === 'acquire') {
			lease = await provider.tryAcquire(command.name, { leaseMs: command.leaseMs })
			respond({ ok: true, acquired: lease !== null, token: lease?.token ?? null })
			return
		}
		if (mode === 'lock' && command.op === 'release') {
			respond({ ok: true, released: await lease?.release() })
			return
		}
		if (mode === 'marker' && command.op === 'touch') {
			respond({
				ok: true,
				marker: await provider.touch(command.identifier, command.updatedAt),
			})
			return
		}
		if (mode === 'marker' && command.op === 'get') {
			respond({ ok: true, marker: await provider.get(command.identifier) })
			return
		}
		if (command.op === 'exit') {
			respond({ ok: true })
			process.exit(0)
		}
		throw new Error(`Unknown command: ${line}`)
	} catch (error) {
		respond({ ok: false, error: error instanceof Error ? error.message : String(error) })
	}
})
