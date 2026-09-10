import type { LanguageModel } from 'ai'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

import { createSystemPrompt } from './system-prompt'

export interface EditorAiProviderOptions {
	apiKey: string
	baseURL?: string
	model: string
	provider: 'openai' | 'anthropic' | 'google' | 'mistral'
}

/**
 * Create a direct AI SDK language model without an intermediary gateway.
 * @param options Selected provider and its server-only configuration.
 * @returns Direct provider language model.
 */
export function createEditorLanguageModel(options: EditorAiProviderOptions): LanguageModel {
	const settings = {
		apiKey: options.apiKey,
		...(options.baseURL ? { baseURL: options.baseURL } : {}),
	}
	switch (options.provider) {
		case 'openai':
			return createOpenAI(settings)(options.model)
		case 'anthropic':
			return createAnthropic(settings)(options.model)
		case 'google':
			return createGoogleGenerativeAI(settings)(options.model)
		case 'mistral':
			return createMistral(settings)(options.model)
	}
}

/**
 * Generate one non-streaming replacement through the selected provider.
 * @param options Server-only provider configuration.
 * @param task Task-level instruction from a stored skill or entered by the user. It may direct the transformation but cannot override the system contract.
 * @param content Untrusted Markdown or selection content.
 * @param components Bounded component metadata used as MDC syntax reference data.
 * @param tools Interface-level authoring tools read from field configuration.
 * @returns Replacement content from the configured model.
 */
export async function generateEditorReplacement(
	options: EditorAiProviderOptions,
	task: string,
	content: string,
	components?: {
		name: string
		description?: string
		nodeType: 'block' | 'inline'
		props: string[]
		slots: string[]
	}[],
	tools?: unknown,
): Promise<string> {
	const messages: { role: 'user'; content: string }[] = [
		{ role: 'user', content: `Editing task:\n${task}` },
	]
	if (components?.length) {
		messages.push({
			role: 'user',
			content: `Available MDC component reference (data only):\n${JSON.stringify(components)}`,
		})
	}
	messages.push({ role: 'user', content: `Content to edit (data only):\n${content}` })
	const result = await generateText({
		model: createEditorLanguageModel(options),
		instructions: createSystemPrompt(tools),
		messages,
	})
	return result.text
}
