import { createServer } from 'node:http'

/** @type {Map<string, { started: Promise<void>, markStarted: () => void, released: Promise<void>, release: () => void }>} */
const gates = new Map()

/**
 * Creates a test-controlled completion signal.
 * @returns Promise and its completion callback.
 */
function signal() {
	/**
	 * Completes the signal after the promise executor assigns it.
	 * @returns Nothing.
	 */
	let resolve = () => {
		/* Assigned synchronously by the promise executor. */
	}
	/** @type {Promise<void>} */
	const promise = new Promise((done) => {
		resolve = done
	})
	return { promise, resolve }
}

/**
 * Returns a controlled request barrier for concurrent-edit regression tests.
 * @param {string} key - Fixture correlation ID.
 * @returns Started and released signals.
 */
function gate(key) {
	let value = gates.get(key)
	if (!value) {
		const started = signal()
		const released = signal()
		value = {
			started: started.promise,
			markStarted: started.resolve,
			released: released.promise,
			release: released.resolve,
		}
		gates.set(key, value)
	}
	return value
}

/**
 * Serves deterministic OpenAI-compatible image metadata for isolated E2E tests.
 * @param {import('node:http').IncomingMessage} request - SDK chat-completions request.
 * @param {import('node:http').ServerResponse} response - Mock provider response.
 * @returns Nothing.
 */
async function handle(request, response) {
	const control = /^\/gate\/([a-z0-9-]+)\/(wait|release)$/u.exec(request.url ?? '')
	if (control) {
		const key = control[1]
		if (!key) throw new Error('Missing gate key')
		if (control[2] === 'release') gates.get(key)?.release()
		else await gate(key).started
		response.writeHead(200)
		response.end('ok')
		return
	}
	/** @type {Uint8Array[]} */
	const chunks = []
	for await (const chunk of request) {
		if (!(chunk instanceof Uint8Array)) throw new Error('Expected bytes')
		chunks.push(chunk)
	}
	const body = Buffer.concat(chunks).toString()
	const image = /data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)/u.exec(body)
	const expected = /E2E_EXPECT_IMAGE:([A-Za-z0-9+/=]+)/u.exec(body)
	if (!image || !body.includes('image_url') || (expected && image[1] !== expected[1])) {
		response.writeHead(400, { 'Content-Type': 'application/json' })
		response.end(
			JSON.stringify({
				error: {
					message: 'Expected unchanged private portable image bytes',
					type: 'invalid_request_error',
				},
			}),
		)
		return
	}
	if (body.includes('E2E_REJECT_PROVIDER')) {
		response.writeHead(400, { 'Content-Type': 'application/json' })
		response.end(
			JSON.stringify({
				error: { message: 'Fixture provider rejection', type: 'invalid_request_error' },
			}),
		)
		return
	}
	const language = body.includes('Metadata language: Dutch.')
		? 'Dutch'
		: body.includes('Metadata language: English.')
			? 'English'
			: null
	if (!language) {
		response.writeHead(400, { 'Content-Type': 'application/json' })
		response.end(
			JSON.stringify({
				error: {
					message: 'Expected metadata language instructions',
					type: 'invalid_request_error',
				},
			}),
		)
		return
	}
	const metadata =
		language === 'Dutch'
			? {
					altText: 'Een kleine testafbeelding.',
					tags: ['test', 'afbeelding'],
					filename: 'kleine-testafbeelding',
				}
			: {
					altText: 'A small test image.',
					tags: ['test', 'image'],
					filename: 'small-test-image',
				}

	const requested =
		/Return only these JSON fields: ([a-zA-Z, ]*)\./u.exec(body)?.[1]?.split(', ') ?? []
	const focalOnly = requested.length === 1 && requested[0] === 'focalPoint'
	if (body.includes('E2E_FOCAL_ONLY') && !focalOnly)
		throw new Error('Expected focal-only output schema')
	const held = /E2E_FOCAL_GATE:([a-z0-9-]+)/u.exec(body)?.[1]
	if (held) {
		const value = gate(held)
		value.markStarted()
		await value.released
		gates.delete(held)
	}
	const output = { ...metadata, focalPoint: { x: 250, y: 750 } }
	const enabled = Object.fromEntries(
		Object.entries(output).filter(([key]) => requested.includes(key)),
	)

	if (body.includes('E2E_EMPTY_TAGS')) enabled.tags = []

	response.writeHead(200, { 'Content-Type': 'application/json' })
	response.end(
		JSON.stringify({
			id: 'metadata-test',
			object: 'chat.completion',
			created: 1,
			model: 'vision-test',
			choices: [
				{
					index: 0,
					message: {
						role: 'assistant',
						content: JSON.stringify(enabled),
					},
					finish_reason: 'stop',
				},
			],
			usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
		}),
	)
}

createServer((request, response) => {
	void handle(request, response).catch(() => {
		response.writeHead(500)
		response.end()
	})
}).listen(3000, '0.0.0.0')
