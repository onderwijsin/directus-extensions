import { z } from 'zod'

/** Persisted options for a Sluggernaut slug interface. */
export const slugInterfaceOptionsSchema = z.strictObject({
	sourceFields: z.array(z.string().trim().min(1)).min(1),
	locale: z.string().trim().min(1).default('en'),
	lowercase: z.boolean().default(true),
	updateOnSourceChange: z.boolean().default(true),
	automaticRedirects: z.boolean().default(false),
})

/** Persisted options for a Sluggernaut permalink interface. */
export const permalinkInterfaceOptionsSchema = z.strictObject({
	generateFromSlug: z.boolean().default(true),
	slugField: z.string().trim().min(1).optional(),
	updateOnSlugChange: z.boolean().default(false),
	prefix: z.string().trim().min(1).optional(),
	validatePrefixOnManualInput: z.boolean().default(false),
	trailingSlash: z.boolean().default(false),
	enforceTrailingSlashOnManualInput: z.boolean().default(false),
	automaticRedirects: z.boolean().default(false),
})

/** Parsed slug interface options with defaults applied. */
export type SlugInterfaceOptions = z.output<typeof slugInterfaceOptionsSchema>
/** Parsed permalink interface options with defaults applied. */
export type PermalinkInterfaceOptions = z.output<typeof permalinkInterfaceOptionsSchema>
