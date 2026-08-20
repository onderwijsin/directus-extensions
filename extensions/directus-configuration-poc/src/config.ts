import { z } from 'zod'

const configurationSchema = z.object({ value: z.string() }).strict()
export type Configuration = z.infer<typeof configurationSchema>

/**
 * Defines the consumer-owned POC configuration for type-safe authoring.
 * @param configuration - Configuration supplied by the consumer.
 * @returns The validated configuration.
 */
export function defineConfig(configuration: Configuration): Configuration {
	return configurationSchema.parse(configuration)
}
