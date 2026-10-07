import {
	defineAiConfigSchema,
	type ExtensionOptionsDefinition,
} from '@onderwijsin/directus-extension-utils/server'

import { acceptedLanguages, defaultLanguage } from './languages'

/** Builds server-only environment configuration with shared AI defaults. */
export const metadataEnvSchema = defineAiConfigSchema(createMetadataEnvironmentShape)

/**
 * Builds environment fields using the supplied package-owned Zod runtime.
 * @param z - Validator supplied by the configuration builder.
 * @returns Metadata environment fields.
 */
export function createMetadataEnvironmentShape(z: typeof import('zod').z) {
	return {
		AI_METADATA_WRITER_LANGUAGE: z.enum(acceptedLanguages).default(defaultLanguage),
		AI_METADATA_WRITER_PROVIDER: z
			.enum(['openai', 'anthropic', 'google', 'mistral', 'openai-compatible'])
			.optional(),
		AI_METADATA_WRITER_MODEL: z
			.string()
			.trim()
			.transform((value) => (value.length > 0 ? value : undefined))
			.optional(),
		AI_METADATA_WRITER_API_KEY: z
			.string()
			.trim()
			.transform((value) => (value.length > 0 ? value : undefined))
			.optional(),
		AI_METADATA_WRITER_BASE_URL: z.url().optional(),
		AI_METADATA_WRITER_PROMPT: z
			.string()
			.trim()
			.transform((value) => (value.length > 0 ? value : undefined))
			.optional(),
		AI_METADATA_WRITER_MAX_IMAGE_BYTES: z.number().int().positive().default(10_000_000),
		AI_METADATA_WRITER_TIMEOUT_MS: z.number().int().positive().default(60_000),
	}
}

/** Validated environment inferred from the shared configuration definition. */
export type MetadataEnvironment =
	typeof metadataEnvSchema extends ExtensionOptionsDefinition<infer Output> ? Output : never
