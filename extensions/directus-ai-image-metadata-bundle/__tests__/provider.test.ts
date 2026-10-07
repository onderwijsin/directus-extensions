import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
	generateText: vi.fn(),
	model: {},
	openai: vi.fn(),
	chat: vi.fn(),
	anthropic: vi.fn(),
	google: vi.fn(),
	mistral: vi.fn(),
}))
vi.mock('ai', async (importOriginal) => ({
	...(await importOriginal()),
	generateText: mocks.generateText,
}))
vi.mock('@ai-sdk/openai', () => ({
	createOpenAI: () => Object.assign(mocks.openai, { chat: mocks.chat }),
}))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => mocks.anthropic }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: () => mocks.google }))
vi.mock('@ai-sdk/mistral', () => ({ createMistral: () => mocks.mistral }))

import {
	createMetadataModel,
	generateMetadata,
	createProviderConfigSchema,
} from '../src/shared/provider'

const parseConfig = (input: unknown) => createProviderConfigSchema(z).parse(input)

describe('metadata provider boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		for (const adapter of [
			mocks.openai,
			mocks.chat,
			mocks.anthropic,
			mocks.google,
			mocks.mistral,
		])
			adapter.mockReturnValue(mocks.model)
		mocks.generateText.mockResolvedValue({
			output: { altText: 'A bicycle.', tags: ['bicycle'], filename: 'bicycle' },
		})
	})
	it.each(['openai', 'anthropic', 'google', 'mistral', 'openai-compatible'])(
		'creates the selected %s model',
		(provider) => {
			expect(
				createMetadataModel(
					parseConfig({
						provider,
						model: 'vision-test',
						apiKey: 'server-secret',
						baseURL: 'https://provider.example/v1',
					}),
				),
			).toBe(mocks.model)
			if (provider === 'openai-compatible')
				expect(mocks.chat).toHaveBeenCalledWith('vision-test')
		},
	)
	it('sends actual private bytes and replacement instructions with a bounded signal', async () => {
		const image = new Uint8Array([1, 2, 3])
		const signal = AbortSignal.timeout(1000)
		await generateMetadata(
			parseConfig({
				provider: 'openai',
				model: 'vision-test',
				apiKey: 'server-secret',
			}),
			image,
			'image/png',
			'Describe visible text in Dutch.',
			signal,
		)
		expect(mocks.generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				instructions: expect.stringContaining('Return only these JSON fields: altText.'),
				abortSignal: signal,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: 'Generate accessible metadata for this image.' },
							{ type: 'image', image, mediaType: 'image/png' },
						],
					},
				],
			}),
		)
	})
	it('rejects malformed model output before it can be written', async () => {
		mocks.generateText.mockResolvedValue({
			output: { altText: '', tags: [], filename: '../file' },
		})
		await expect(
			generateMetadata(
				parseConfig({
					provider: 'openai',
					model: 'vision-test',
					apiKey: 'server-secret',
				}),
				new Uint8Array([1]),
				'image/png',
				'prompt',
				AbortSignal.timeout(1000),
			),
		).rejects.toThrow()
	})
	it.each([
		{ generateTags: false, generateFilename: false },
		{ generateTags: true, generateFilename: false },
		{ generateTags: false, generateFilename: true },
		{ generateTags: true, generateFilename: true },
	])('requests and validates only enabled fields: %j', async (options) => {
		mocks.generateText.mockResolvedValue({
			output: {
				altText: 'A classroom.',
				tags: options.generateTags ? ['classroom'] : null,
				filename: options.generateFilename ? 'classroom' : 'Klassenfoto 2026.jpg',
			},
		})
		const result = await generateMetadata(
			parseConfig({ provider: 'openai', model: 'vision-test', apiKey: 'secret' }),
			new Uint8Array([1]),
			'image/png',
			'prompt',
			AbortSignal.timeout(1000),
			options,
		)
		expect(result).toEqual({
			altText: 'A classroom.',
			...(options.generateTags ? { tags: ['classroom'] } : {}),
			...(options.generateFilename ? { filename: 'classroom' } : {}),
		})
		const request = mocks.generateText.mock.calls[0]?.[0]
		expect(request.instructions).toContain(options.generateTags ? 'altText, tags' : 'altText')
	})
	it.each(['tags', 'filename'])('rejects invalid requested %s output', async (field) => {
		mocks.generateText.mockResolvedValue({
			output: { altText: 'A classroom.', tags: null, filename: 'Klassenfoto 2026.jpg' },
		})
		await expect(
			generateMetadata(
				parseConfig({ provider: 'openai', model: 'vision-test', apiKey: 'secret' }),
				new Uint8Array([1]),
				'image/png',
				'prompt',
				AbortSignal.timeout(1000),
				{ generateTags: field === 'tags', generateFilename: field === 'filename' },
			),
		).rejects.toThrow()
	})

	it('requires a compatible-provider endpoint and rejects unsupported adapters', () => {
		expect(() =>
			parseConfig({ provider: 'openai-compatible', model: 'vision', apiKey: 'key' }),
		).toThrow()
		expect(() => parseConfig({ provider: 'unknown', model: 'vision', apiKey: 'key' })).toThrow()
	})
})
