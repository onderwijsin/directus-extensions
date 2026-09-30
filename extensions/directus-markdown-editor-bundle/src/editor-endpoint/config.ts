import type { ApiExtensionContext, SchemaOverview } from '@directus/types'
import type { AiConfig } from '@onderwijsin/directus-extension-utils/server'
import type { EditorAiProviderOptions } from './provider'

import {
	readDirectusAiSettings,
	resolveAiConfig,
	resolvedAiConfigSchema,
} from '@onderwijsin/directus-extension-utils/server'

import { editorAiProviderSchema } from './env.schema'
import { EditorAiUnavailableError } from './errors'

interface EditorAiEnvironmentOptions extends AiConfig {
	EDITOR_AI_PROVIDER?: EditorAiProviderOptions['provider']
	EDITOR_AI_MODEL?: string
	EDITOR_AI_API_KEY?: string
	EDITOR_AI_BASE_URL?: string
}

interface ResolveEditorAiProviderInput {
	options: EditorAiEnvironmentOptions
	services: ApiExtensionContext['services']
	schema: SchemaOverview
}

/**
 * Resolves and validates the Markdown Editor's effective provider configuration.
 * @param input - Validated environment and Directus service context.
 * @returns Complete provider configuration accepted by the editor provider adapter.
 */
export async function resolveEditorAiProvider(
	input: ResolveEditorAiProviderInput,
): Promise<EditorAiProviderOptions> {
	const configLayers = {
		extensionEnv: {
			...(input.options.EDITOR_AI_PROVIDER
				? { provider: input.options.EDITOR_AI_PROVIDER }
				: {}),
			...(input.options.EDITOR_AI_MODEL ? { model: input.options.EDITOR_AI_MODEL } : {}),
			...(input.options.EDITOR_AI_API_KEY ? { apiKey: input.options.EDITOR_AI_API_KEY } : {}),
			...(input.options.EDITOR_AI_BASE_URL
				? { baseURL: input.options.EDITOR_AI_BASE_URL }
				: {}),
		},
		sharedEnv: input.options,
	}
	const environmentConfig = resolveAiConfig(configLayers)
	const effectiveConfig = environmentConfig.apiKey
		? environmentConfig
		: resolveAiConfig({
				...configLayers,
				directusSettings: await readDirectusAiSettings(
					new input.services.SettingsService({ schema: input.schema }),
				),
			})
	const providerConfig = resolvedAiConfigSchema.safeParse(effectiveConfig)
	if (!providerConfig.success)
		throw new EditorAiUnavailableError({
			reason: 'Editor AI provider configuration is incomplete.',
		})
	const supportedProvider = editorAiProviderSchema.safeParse(providerConfig.data.provider)
	if (!supportedProvider.success)
		throw new EditorAiUnavailableError({ reason: 'Editor AI provider is unsupported.' })

	return { ...providerConfig.data, provider: supportedProvider.data }
}
