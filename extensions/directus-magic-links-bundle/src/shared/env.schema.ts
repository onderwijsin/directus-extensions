import {
	defineExtensionOptionsSchema,
	directusStartupConfig,
	type ExtensionOptionsDefinition,
} from '@onderwijsin/directus-extension-utils/server'

/**
 * Builds configuration shared by both entries with the supplied Zod runtime.
 * @param z - The package-owned Zod runtime.
 * @returns Shared magic-links environment fields.
 */
export function defineSharedMagicLinksOptions(z: typeof import('zod').z) {
	return {
		MAGIC_LINKS_ENABLED: z.boolean().default(true),
		MAGIC_LINKS_COLLECTION: z
			.string()
			.trim()
			.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
			.refine((value) => !value.startsWith('directus_'), {
				message: 'Collection names may not start with directus_',
			})
			.default('magic_links'),
	}
}

/**
 * Validates configuration shared by the magic-links endpoint and hook entries.
 *
 * @returns The shared magic-links environment definition.
 */
export const sharedEnvSchema = defineExtensionOptionsSchema({
	include: [directusStartupConfig],
	options: defineSharedMagicLinksOptions,
})

export type SharedEnv =
	typeof sharedEnvSchema extends ExtensionOptionsDefinition<infer Options> ? Options : never
