import { type AbstractService } from '@directus/types'
import { z } from 'zod'

import {
	createExtensionOptionsConfigFragment,
	defineExtensionOptionsShape,
	type ExtensionOptionsShapeBuilder,
} from '../schema-builder'

const nonBlankStringSchema = z.string().trim().min(1)

/**
 * Builds shared AI environment fields for raw schemas and fragments.
 * @param zod - Package-owned Zod runtime.
 * @returns The shared AI configuration shape.
 */
const defineAiConfigShape = (zod: typeof z) => ({
	DIRECTUS_EXTENSIONS_AI_PROVIDER: zod.string().trim().min(1).optional(),
	DIRECTUS_EXTENSIONS_AI_MODEL: zod.string().trim().min(1).optional(),
	DIRECTUS_EXTENSIONS_AI_API_KEY: zod.preprocess(
		(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
		zod.string().trim().min(1).optional(),
	),
	DIRECTUS_EXTENSIONS_AI_BASE_URL: zod.url().optional(),
})

/** Directus AI settings that extensions may reuse without exposing credentials to clients. */
export const directusAiSettingsSchema = z.object({
	ai_openai_api_key: nonBlankStringSchema.nullish(),
	ai_anthropic_api_key: nonBlankStringSchema.nullish(),
	ai_google_api_key: nonBlankStringSchema.nullish(),
	ai_openai_compatible_api_key: nonBlankStringSchema.nullish(),
	ai_openai_compatible_base_url: z.url().nullish(),
})

/** Shared AI environment configuration. */
export const aiConfigSchema = z.object(defineAiConfigShape(z))

/** Complete AI provider configuration after resolving all fallback layers. */
export const resolvedAiConfigSchema = z.object({
	provider: nonBlankStringSchema,
	model: nonBlankStringSchema,
	apiKey: nonBlankStringSchema,
	baseURL: z.url().optional(),
})

export type AiConfig = z.output<typeof aiConfigSchema>
export type DirectusAiSettings = z.output<typeof directusAiSettingsSchema>

/** Provider configuration normalized across extension-specific configuration layers. */
export type AiConfigLayer = Partial<z.output<typeof resolvedAiConfigSchema>>

/** Inputs used to resolve effective AI configuration. */
export interface ResolveAiConfigOptions {
	/** Highest-precedence values from interface, operation, or other extension options. */
	optionOverrides?: AiConfigLayer
	/** Extension-specific environment values. */
	extensionEnv?: AiConfigLayer
	/** Validated shared `DIRECTUS_EXTENSIONS_AI_*` environment values. */
	sharedEnv?: AiConfig
	/** Internally read Directus settings containing decrypted provider credentials. */
	directusSettings?: DirectusAiSettings
}

const directusAiSettingsFields = [
	'ai_openai_api_key',
	'ai_anthropic_api_key',
	'ai_google_api_key',
	'ai_openai_compatible_api_key',
	'ai_openai_compatible_base_url',
] satisfies (keyof typeof directusAiSettingsSchema.shape)[]

/** Shared optional AI configuration for declarative options composition. */
export const aiConfig = createExtensionOptionsConfigFragment<AiConfig>({
	name: 'aiConfig',
	shape: defineAiConfigShape,
})

/**
 * Defines extension options that include shared AI environment configuration.
 *
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export const defineAiConfigSchema = <const Shape extends z.ZodRawShape>(
	builder: ExtensionOptionsShapeBuilder<Shape>,
) => defineExtensionOptionsShape(aiConfig, builder)

/**
 * Reads reusable credentials from Directus with a caller-created, unaccountable SettingsService.
 *
 * The caller must construct the service without accountability so encrypted values are decrypted.
 * Never return the result to a client.
 *
 * @param settingsService - Internal Directus SettingsService instance without accountability.
 * @returns Validated Directus AI credentials and compatible-provider base URL.
 */
export async function readDirectusAiSettings(
	settingsService: Pick<AbstractService, 'readSingleton'>,
): Promise<DirectusAiSettings> {
	const settings = await settingsService.readSingleton({ fields: [...directusAiSettingsFields] })
	return directusAiSettingsSchema.parse(settings)
}

/**
 * Resolves AI configuration from local options, local environment, shared environment, and
 * provider-matched Directus credentials, in that order.
 *
 * Directus does not provide a general default provider or model. Its credential fallback is chosen
 * only after the effective provider has been resolved by the higher-precedence layers. Models,
 * keys, and URLs are inherited only from layers belonging to that provider. A provider-less
 * layer belongs to the provider inherited from lower layers, never an override above it.
 *
 * @param options - Configuration layers ordered by documented precedence.
 * @returns The effective, possibly incomplete AI configuration.
 */
export function resolveAiConfig(options: ResolveAiConfigOptions): AiConfigLayer {
	const provider =
		options.optionOverrides?.provider ??
		options.extensionEnv?.provider ??
		options.sharedEnv?.DIRECTUS_EXTENSIONS_AI_PROVIDER
	const sharedLayer: AiConfigLayer = {
		provider: options.sharedEnv?.DIRECTUS_EXTENSIONS_AI_PROVIDER,
		model: options.sharedEnv?.DIRECTUS_EXTENSIONS_AI_MODEL,
		apiKey: options.sharedEnv?.DIRECTUS_EXTENSIONS_AI_API_KEY,
		baseURL: options.sharedEnv?.DIRECTUS_EXTENSIONS_AI_BASE_URL,
	}
	const layers = [options.optionOverrides, options.extensionEnv, sharedLayer]
	// A layer without a provider belongs to the provider inherited from layers below it.
	// Lower layers never acquire a provider from an override above them.
	const matchingLayers = layers.filter((layer, index) => {
		const owner = layers.slice(index).find((candidate) => candidate?.provider)?.provider
		return provider !== undefined && owner === provider && layer !== undefined
	})
	const matchingModel = matchingLayers.find((layer) => layer?.model !== undefined)?.model
	const apiKey =
		matchingLayers.find((layer) => layer?.apiKey !== undefined)?.apiKey ??
		getDirectusAiApiKey(provider, options.directusSettings)
	const baseURL =
		matchingLayers.find((layer) => layer?.baseURL !== undefined)?.baseURL ??
		(provider === 'openai-compatible'
			? (options.directusSettings?.ai_openai_compatible_base_url ?? undefined)
			: undefined)

	return {
		...(provider ? { provider } : {}),
		...(matchingModel ? { model: matchingModel } : {}),
		...(apiKey ? { apiKey } : {}),
		...(baseURL ? { baseURL } : {}),
	}
}

/**
 * Selects the Directus credential matching an effective provider.
 * @param provider - Effective provider identifier.
 * @param settings - Internally read Directus AI settings.
 * @returns The matching decrypted credential, when Directus supports the provider.
 */
function getDirectusAiApiKey(
	provider: string | undefined,
	settings: DirectusAiSettings | undefined,
): string | undefined {
	if (!settings) return undefined

	switch (provider) {
		case 'openai':
			return settings.ai_openai_api_key ?? undefined
		case 'anthropic':
			return settings.ai_anthropic_api_key ?? undefined
		case 'google':
			return settings.ai_google_api_key ?? undefined
		case 'openai-compatible':
			return settings.ai_openai_compatible_api_key ?? undefined
		default:
			return undefined
	}
}
