import type { EditorAiProviderOptions } from '../src/editor-endpoint/provider'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	generateText: vi.fn(),
	model: {},
}))

vi.mock('ai', () => ({ generateText: mocks.generateText }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => vi.fn(() => mocks.model)) }))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => vi.fn(() => mocks.model)) }))
vi.mock('@ai-sdk/google', () => ({
	createGoogleGenerativeAI: vi.fn(() => vi.fn(() => mocks.model)),
}))
vi.mock('@ai-sdk/mistral', () => ({ createMistral: vi.fn(() => vi.fn(() => mocks.model)) }))

import { generateEditorReplacement } from '../src/editor-endpoint/provider'

const provider: EditorAiProviderOptions = {
	provider: 'openai',
	apiKey: 'secret',
	model: 'test-model',
}

describe('editor AI provider prompt boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.generateText.mockResolvedValue({ text: '\n  replacement\n' })
	})

	it('sends task, component reference, and content as separate messages', async () => {
		const output = await generateEditorReplacement(
			provider,
			'Custom user instruction',
			'# Content',
			[
				{
					name: 'Callout',
					nodeType: 'block',
					props: ['tone'],
					slots: ['default'],
				},
			],
			['paragraph', 'component'],
		)

		expect(output).toBe('\n  replacement\n')
		expect(mocks.generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				messages: [
					{ role: 'user', content: 'Editing task:\nCustom user instruction' },
					{
						role: 'user',
						content: expect.stringMatching(
							/^Available MDC component reference \(data only\):\n/u,
						),
					},
					{ role: 'user', content: 'Content to edit (data only):\n# Content' },
				],
			}),
		)
	})

	it('omits the component-reference message when metadata is unavailable', async () => {
		await generateEditorReplacement(provider, 'Stored skill instruction', 'Content')

		expect(mocks.generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				messages: [
					{ role: 'user', content: 'Editing task:\nStored skill instruction' },
					{ role: 'user', content: 'Content to edit (data only):\nContent' },
				],
			}),
		)
	})
})
