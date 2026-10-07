import type { OperationContext, SchemaOverview } from '@directus/types'
import type { MetadataEnvironment } from './env'
import type { MetadataOptions } from './options'

import { attemptSync } from '@onderwijsin/directus-extension-utils'
import {
	type AiConfigLayer,
	resolveAiConfig,
	readDirectusAiSettings,
} from '@onderwijsin/directus-extension-utils/server'

import { MetadataUnavailableError } from './contracts'
import { parseProviderConfig } from './provider'

/**
 * Builds a lazy provider resolver with privileged credential access confined to settings.
 * @param context - Flow services.
 * @param schema - Current schema.
 * @param env - Validated environment.
 * @param options - Operation overrides.
 * @returns Configuration resolver.
 */
export function createProviderResolver(
	context: OperationContext,
	schema: SchemaOverview,
	env: MetadataEnvironment,
	options: MetadataOptions,
) {
	/**
	 * Lazily resolves credentials after an eligible file is found.
	 * @returns Validated provider configuration.
	 */
	async function resolveProvider() {
		const layers = {
			optionOverrides: { provider: options.provider, model: options.model },
			extensionEnv: {
				provider: env.AI_METADATA_WRITER_PROVIDER,
				model: env.AI_METADATA_WRITER_MODEL,
				apiKey: env.AI_METADATA_WRITER_API_KEY,
				baseURL: env.AI_METADATA_WRITER_BASE_URL,
			},
			sharedEnv: env,
		}
		const first = resolveAiConfig(layers)
		const effective =
			first.apiKey && (first.provider !== 'openai-compatible' || first.baseURL)
				? first
				: resolveAiConfig({
						...layers,
						directusSettings: await readDirectusAiSettings(
							new context.services.SettingsService({
								schema,
								knex: context.database,
							}),
						),
					})
		const parsed = attemptSync(() => parseProviderConfig(effective, context.logger))
		if (parsed.data === null)
			throw new MetadataUnavailableError({ reason: describeProviderConfiguration(effective) })
		return parsed.data
	}

	return resolveProvider
}

/**
 * Explains configuration failures using setting names only, never credential or input values.
 * @param config - Effective configuration after fallback resolution.
 * @returns Actionable, credential-safe configuration guidance.
 */
export function describeProviderConfiguration(config: AiConfigLayer): string {
	const issues: string[] = []
	if (
		!config.provider ||
		!['openai', 'anthropic', 'google', 'mistral', 'openai-compatible'].includes(config.provider)
	)
		issues.push(
			'Set a supported provider in the operation, AI_METADATA_WRITER_PROVIDER, or DIRECTUS_EXTENSIONS_AI_PROVIDER: openai, anthropic, google, mistral, openai-compatible.',
		)
	if (!config.model?.trim())
		issues.push(
			'Set a model in the operation, AI_METADATA_WRITER_MODEL, or DIRECTUS_EXTENSIONS_AI_MODEL; Directus settings do not supply a default model.',
		)
	if (!config.apiKey?.trim())
		issues.push(
			'Set AI_METADATA_WRITER_API_KEY or DIRECTUS_EXTENSIONS_AI_API_KEY, or save credentials for the selected provider in Directus AI settings (Mistral requires an environment API key).',
		)
	if (config.provider === 'openai-compatible' && !config.baseURL)
		issues.push(
			'Set AI_METADATA_WRITER_BASE_URL or DIRECTUS_EXTENSIONS_AI_BASE_URL, or the OpenAI-compatible base URL in Directus AI settings.',
		)
	if (config.baseURL && !URL.canParse(config.baseURL))
		issues.push(
			'The provider base URL must be a valid absolute URL. Check AI_METADATA_WRITER_BASE_URL, DIRECTUS_EXTENSIONS_AI_BASE_URL, and Directus AI settings.',
		)
	return issues.join(' ') || 'Check the provider, model, API key, and base URL settings.'
}
