import { describe, expect, it, vi } from 'vitest'

import {
	aiConfigSchema,
	directusAiSettingsSchema,
	readDirectusAiSettings,
	resolveAiConfig,
	resolvedAiConfigSchema,
} from '../src/server/config/ai'

describe('AI configuration', () => {
	it.each(['', '   '])('treats a blank optional environment key as unset: %j', (key) => {
		expect(aiConfigSchema.parse({ DIRECTUS_EXTENSIONS_AI_API_KEY: key })).toEqual({
			DIRECTUS_EXTENSIONS_AI_API_KEY: undefined,
		})
	})
	it('still rejects invalid key types and requires a resolved key', () => {
		expect(aiConfigSchema.safeParse({ DIRECTUS_EXTENSIONS_AI_API_KEY: 42 }).success).toBe(false)
		expect(
			resolvedAiConfigSchema.safeParse({ provider: 'openai', model: 'vision', apiKey: '' })
				.success,
		).toBe(false)
	})
	it('validates shared environment and Directus settings', () => {
		expect(
			aiConfigSchema.parse({
				DIRECTUS_EXTENSIONS_AI_PROVIDER: 'openai',
				DIRECTUS_EXTENSIONS_AI_MODEL: 'gpt-5-mini',
				DIRECTUS_EXTENSIONS_AI_BASE_URL: 'https://api.example.com/v1',
			}),
		).toMatchObject({ DIRECTUS_EXTENSIONS_AI_PROVIDER: 'openai' })
		expect(aiConfigSchema.safeParse({ DIRECTUS_EXTENSIONS_AI_MODEL: ' ' }).success).toBe(false)
		expect(
			directusAiSettingsSchema.safeParse({ ai_openai_compatible_base_url: 'not-a-url' })
				.success,
		).toBe(false)
	})

	it('requires a complete resolved provider configuration', () => {
		expect(
			resolvedAiConfigSchema.safeParse({
				provider: 'openai',
				model: 'gpt-5-mini',
				apiKey: 'secret',
			}).success,
		).toBe(true)
		expect(
			resolvedAiConfigSchema.safeParse({ provider: 'openai', model: 'gpt-5-mini' }).success,
		).toBe(false)
	})

	it('applies precedence only within the selected provider', () => {
		expect(
			resolveAiConfig({
				optionOverrides: { model: 'option-model' },
				extensionEnv: { provider: 'anthropic', model: 'extension-model' },
				sharedEnv: {
					DIRECTUS_EXTENSIONS_AI_PROVIDER: 'openai',
					DIRECTUS_EXTENSIONS_AI_MODEL: 'shared-model',
					DIRECTUS_EXTENSIONS_AI_API_KEY: 'shared-key',
				},
				directusSettings: { ai_anthropic_api_key: 'directus-key' },
			}),
		).toEqual({ provider: 'anthropic', model: 'option-model', apiKey: 'directus-key' })
	})

	it('uses only the Directus credential matching the effective provider', () => {
		expect(
			resolveAiConfig({
				extensionEnv: { provider: 'google', model: 'gemini-2.5-flash' },
				directusSettings: {
					ai_openai_api_key: 'wrong-key',
					ai_google_api_key: 'google-key',
				},
			}),
		).toEqual({ provider: 'google', model: 'gemini-2.5-flash', apiKey: 'google-key' })
		expect(
			resolveAiConfig({
				extensionEnv: { provider: 'mistral', model: 'mistral-large' },
				directusSettings: { ai_openai_api_key: 'openai-key' },
			}),
		).toEqual({ provider: 'mistral', model: 'mistral-large' })
	})

	it('reuses the Directus compatible-provider URL and credential', () => {
		expect(
			resolveAiConfig({
				extensionEnv: { provider: 'openai-compatible', model: 'local-model' },
				directusSettings: {
					ai_openai_compatible_api_key: 'compatible-key',
					ai_openai_compatible_base_url: 'http://localhost:1234/v1',
				},
			}),
		).toEqual({
			provider: 'openai-compatible',
			model: 'local-model',
			apiKey: 'compatible-key',
			baseURL: 'http://localhost:1234/v1',
		})
	})

	it('does not inherit OpenAI values into an operation Anthropic override', () => {
		expect(
			resolveAiConfig({
				optionOverrides: { provider: 'anthropic' },
				sharedEnv: {
					DIRECTUS_EXTENSIONS_AI_PROVIDER: 'openai',
					DIRECTUS_EXTENSIONS_AI_MODEL: 'gpt-model',
					DIRECTUS_EXTENSIONS_AI_API_KEY: 'openai-secret',
					DIRECTUS_EXTENSIONS_AI_BASE_URL: 'https://openai.example/v1',
				},
				directusSettings: { ai_anthropic_api_key: 'anthropic-secret' },
			}),
		).toEqual({ provider: 'anthropic', apiKey: 'anthropic-secret' })
	})
	it('keeps extension Anthropic credentials and drops the shared OpenAI model and URL', () => {
		expect(
			resolveAiConfig({
				extensionEnv: { provider: 'anthropic', apiKey: 'anthropic-secret' },
				sharedEnv: {
					DIRECTUS_EXTENSIONS_AI_PROVIDER: 'openai',
					DIRECTUS_EXTENSIONS_AI_MODEL: 'gpt-model',
					DIRECTUS_EXTENSIONS_AI_API_KEY: 'openai-secret',
					DIRECTUS_EXTENSIONS_AI_BASE_URL: 'https://openai.example/v1',
				},
			}),
		).toEqual({ provider: 'anthropic', apiKey: 'anthropic-secret' })
	})
	it('does not inherit a base URL across a compatible-provider override', () => {
		expect(
			resolveAiConfig({
				optionOverrides: { provider: 'openai-compatible', model: 'local-model' },
				sharedEnv: {
					DIRECTUS_EXTENSIONS_AI_PROVIDER: 'openai',
					DIRECTUS_EXTENSIONS_AI_API_KEY: 'openai-secret',
					DIRECTUS_EXTENSIONS_AI_BASE_URL: 'https://openai.example/v1',
				},
			}),
		).toEqual({ provider: 'openai-compatible', model: 'local-model' })
	})
	it('inherits matching-provider values through a model-only override', () => {
		expect(
			resolveAiConfig({
				optionOverrides: { model: 'another-model' },
				sharedEnv: {
					DIRECTUS_EXTENSIONS_AI_PROVIDER: 'openai-compatible',
					DIRECTUS_EXTENSIONS_AI_MODEL: 'original-model',
					DIRECTUS_EXTENSIONS_AI_API_KEY: 'matching-key',
					DIRECTUS_EXTENSIONS_AI_BASE_URL: 'https://matching.example/v1',
				},
			}),
		).toEqual({
			provider: 'openai-compatible',
			model: 'another-model',
			apiKey: 'matching-key',
			baseURL: 'https://matching.example/v1',
		})
	})
	it('does not bind provider-less lower-layer credentials to an upper provider override', () => {
		expect(
			resolveAiConfig({
				extensionEnv: { provider: 'anthropic', model: 'claude-model' },
				sharedEnv: { DIRECTUS_EXTENSIONS_AI_API_KEY: 'unbound-key' },
			}),
		).toEqual({ provider: 'anthropic', model: 'claude-model' })
	})

	it('reads only the reusable internal Directus settings', async () => {
		const readSingleton = vi.fn().mockResolvedValue({ ai_openai_api_key: 'decrypted-key' })
		await expect(readDirectusAiSettings({ readSingleton })).resolves.toEqual({
			ai_openai_api_key: 'decrypted-key',
		})
		expect(readSingleton).toHaveBeenCalledWith({
			fields: [
				'ai_openai_api_key',
				'ai_anthropic_api_key',
				'ai_google_api_key',
				'ai_openai_compatible_api_key',
				'ai_openai_compatible_base_url',
			],
		})
	})
})
