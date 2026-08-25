import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

/** @type {Record<string, unknown>} */
const emailMessage = JSON.parse(
	await readFile(new URL('./email-message.json', import.meta.url), 'utf8'),
)
/** @type {Record<string, unknown>[]} */
const profileUpdates = []

/**
 * Sends a JSON response.
 * @param {import('node:http').ServerResponse} response - HTTP response.
 * @param {number} status - HTTP status code.
 * @param {unknown} body - Response body.
 * @returns {void}
 */
const json = (response, status, body) => {
	response.writeHead(status, { 'content-type': 'application/json' })
	response.end(JSON.stringify(body))
}

/**
 * Reads and parses a JSON request body.
 * @param {import('node:http').IncomingMessage} request - HTTP request.
 * @returns {Promise<unknown>} Parsed request body.
 */
const readBody = async (request) => {
	const chunks = []
	for await (const chunk of request) chunks.push(chunk)
	/** @type {unknown} */
	const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
	return body
}

/**
 * Handles one Loops mock request.
 * @param {import('node:http').IncomingMessage} request - HTTP request.
 * @param {import('node:http').ServerResponse} response - HTTP response.
 * @returns {Promise<void>}
 */
const handleRequest = async (request, response) => {
	try {
		const url = new URL(request.url ?? '/', 'http://loops-mock')
		if (request.method === 'GET' && url.pathname === '/health') {
			json(response, 200, { ok: true })
			return
		}
		if (request.method === 'GET' && url.pathname === '/mock/profile-updates') {
			json(response, 200, profileUpdates)
			return
		}
		if (request.method === 'POST' && url.pathname === '/mock/reset') {
			profileUpdates.length = 0
			json(response, 200, { ok: true })
			return
		}
		if (request.method === 'GET' && url.pathname.startsWith('/api/v1/email-messages/')) {
			const id = decodeURIComponent(url.pathname.slice('/api/v1/email-messages/'.length))
			json(
				response,
				id === emailMessage.id ? 200 : 404,
				id === emailMessage.id ? emailMessage : { message: 'Email message not found.' },
			)
			return
		}
		if (request.method === 'PUT' && url.pathname === '/api/v1/contacts/update') {
			profileUpdates.push(await readBody(request))
			json(response, 200, { success: true, id: 'mock-contact-id' })
			return
		}
		json(response, 404, { message: 'Not found' })
	} catch (error) {
		json(response, 400, { message: error instanceof Error ? error.message : 'Invalid request' })
	}
}

const server = createServer((request, response) => {
	void handleRequest(request, response)
})

server.listen(3000, '0.0.0.0')
