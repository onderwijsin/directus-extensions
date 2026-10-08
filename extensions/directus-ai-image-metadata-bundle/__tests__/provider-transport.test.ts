import { readFile } from 'node:fs/promises'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { generateMetadata, createProviderConfigSchema } from '../src/shared/providers/provider'

const providers = ['openai', 'openai-compatible', 'anthropic', 'google', 'mistral']
const cases = providers.flatMap((provider) =>
	['jpeg', 'png', 'webp'].map((format) => ({ provider, format })),
)
const metadata = JSON.stringify({ altText: 'A red square.' })

/**
 * Creates minimal successful real-adapter responses for deterministic transport validation.
 * @param provider - Adapter name.
 * @returns HTTP provider fixture.
 */
function response(provider: string) {
	if (provider === 'anthropic')
		return {
			id: 'msg_test',
			type: 'message',
			role: 'assistant',
			model: 'vision-test',
			content: [
				{ type: 'tool_use', id: 'tool_test', name: 'json', input: JSON.parse(metadata) },
			],
			stop_reason: 'tool_use',
			stop_sequence: null,
			usage: { input_tokens: 10, output_tokens: 10 },
		}
	if (provider === 'google')
		return {
			candidates: [
				{
					content: { role: 'model', parts: [{ text: metadata }] },
					finishReason: 'STOP',
					index: 0,
				},
			],
			usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
		}
	if (provider === 'openai')
		return {
			id: 'resp_test',
			object: 'response',
			created_at: 1,
			model: 'vision-test',
			status: 'completed',
			output: [
				{
					id: 'msg_test',
					type: 'message',
					role: 'assistant',
					status: 'completed',
					content: [{ type: 'output_text', text: metadata, annotations: [] }],
				},
			],
			usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
		}
	return {
		id: 'chat_test',
		object: 'chat.completion',
		created: 1,
		model: 'vision-test',
		choices: [
			{ index: 0, message: { role: 'assistant', content: metadata }, finish_reason: 'stop' },
		],
		usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
	}
}

afterEach(() => vi.unstubAllGlobals())

describe('real vision adapter portable image transport', () => {
	it.each(cases)(
		'sends unchanged $format bytes and matching MIME through $provider',
		async ({ provider, format }) => {
			const requests: string[] = []
			vi.stubGlobal(
				'fetch',
				vi.fn((_url: unknown, init?: RequestInit) => {
					if (typeof init?.body !== 'string')
						throw new Error('Expected JSON request body')
					requests.push(init.body)
					return Promise.resolve(
						new Response(JSON.stringify(response(provider)), {
							headers: { 'Content-Type': 'application/json' },
						}),
					)
				}),
			)
			const image = await readFile(new URL(`./fixtures/red.${format}`, import.meta.url))
			const signal = AbortSignal.timeout(10_000)
			const config = createProviderConfigSchema(z).parse({
				provider,
				model: 'vision-test',
				apiKey: 'fixture',
				baseURL: 'https://fixture.invalid/v1',
			})
			await expect(
				generateMetadata(config, image, `image/${format}`, 'Describe the image.', signal),
			).resolves.toEqual({ altText: 'A red square.' })
			expect(requests).toHaveLength(1)
			expect(requests[0]).toContain(Buffer.from(image).toString('base64'))
			expect(requests[0]).toContain(`image/${format}`)
			expect(requests[0]).not.toContain('image/avif')
		},
	)
})
