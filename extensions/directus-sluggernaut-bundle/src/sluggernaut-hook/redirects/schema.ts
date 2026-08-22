import { keys } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

export const inactiveReasonSchema = z.enum(['archived', 'deleted'])

export const redirectRecordSchema = z.strictObject({
	id: z.union([z.uuid(), z.number()]),
	origin: z.string(),
	destination: z.string(),
	type: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).default(301),
	is_active: z.boolean().default(true),
	start_date: z.string().datetime().nullable().optional(),
	end_date: z.string().datetime().nullable().optional(),
	managed_by: z.literal('sluggernaut').nullable().default(null),
	source_collection: z.string().nullable().default(null),
	source_item: z.union([z.string(), z.number()]).nullable().default(null),
	source_field: z.string().nullable().default(null),
	source_type: z.enum(['slug', 'permalink']).nullable().default(null),
	inactive_reason: inactiveReasonSchema.nullable().default(null),
})

export const redirectCreateSchema = redirectRecordSchema
	.omit({
		id: true,
	})
	.extend({
		// Record creation from within hook, means these values MUST be provided
		managed_by: z.literal('sluggernaut'),
		source_collection: z.string(),
		source_item: z.union([z.string(), z.number()]),
		source_field: z.string(),
		source_type: z.enum(['slug', 'permalink']),
		inactive_reason: z.null(),
	})

export const REDIRECT_FIELDS = keys(redirectRecordSchema.shape)

export type RedirectSourceType = NonNullable<
	z.output<typeof redirectRecordSchema.shape.source_type>
>
export type InactiveReason = z.output<typeof inactiveReasonSchema>
export type RedirectField = keyof typeof redirectRecordSchema.shape
export type Redirect = z.output<typeof redirectRecordSchema>
export type RedirectCreateInput = z.input<typeof redirectCreateSchema>

/** Identifies the configured field that supplies a canonical redirect URL. */
export interface RedirectSource {
	type: RedirectSourceType
	field: string
	includeUnmanagedRedirectsInPlanning?: boolean
	unmanagedRedirectConflictBehavior?: 'block' | 'override'
}
