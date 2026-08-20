import { z } from 'zod'

const optionalBoolean = z.boolean().optional()

export const slugInterfaceOptionsSchema = z.strictObject({
	sourceFields: z.array(z.string().trim().min(1)).min(1),
	locale: z.string().trim().min(1).default('en'),
	lowercase: z.boolean().default(true),
	updateOnSourceChange: z.boolean().default(true),
	automaticRedirects: optionalBoolean.default(false),
})

export const permalinkInterfaceOptionsSchema = z.strictObject({
	generateFromSlug: z.boolean().default(true),
	slugField: z.string().trim().min(1).optional(),
	updateOnSlugChange: z.boolean().default(false),
	prefix: z.string().trim().min(1).optional(),
	validatePrefixOnManualInput: z.boolean().default(false),
	trailingSlash: z.boolean().default(false),
	enforceTrailingSlashOnManualInput: z.boolean().default(false),
	automaticRedirects: optionalBoolean.default(false),
})

export type SlugInterfaceOptions = z.output<typeof slugInterfaceOptionsSchema>
export type PermalinkInterfaceOptions = z.output<typeof permalinkInterfaceOptionsSchema>
