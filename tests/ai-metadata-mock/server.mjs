import { createServer } from 'node:http'

/**
 * Serves deterministic OpenAI-compatible image metadata for isolated E2E tests.
 * @param {import('node:http').IncomingMessage} request - SDK chat-completions request.
 * @param {import('node:http').ServerResponse} response - Mock provider response.
 * @returns Nothing.
 */
async function handle(request, response) {
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

	if (body.includes('E2E_EMPTY_TAGS')) metadata.tags = []

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
						content: JSON.stringify(metadata),
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
