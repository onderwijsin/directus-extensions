import { z } from 'zod'

export const EDITOR_SKILLS_COLLECTION = 'editor_skills'
export const CAN_USE_EDITOR_SKILLS_POLICY_ID = 'de720a9d-8881-4d53-a929-70b6684f96d1'

/** Supported content scopes for reusable editor transformations. */
export const editorSkillScopeSchema = z.enum(['document', 'selection'])

/** Single runtime source of truth for persisted editor skill records. */
export const editorSkillSchema = z.object({
	id: z.uuid(),
	name: z.string().trim().min(1),
	description: z.string().nullable().default(null),
	icon: z.string().trim().min(1).nullable().default(null),
	scopes: z.array(editorSkillScopeSchema).min(1),
	prompt: z.string().trim().min(1),
	archived: z.boolean().default(false),
	sort: z.number().int().nullable().default(null),
	user_created: z.uuid().nullable().default(null),
	date_created: z.string().nullable().default(null),
	user_updated: z.uuid().nullable().default(null),
	date_updated: z.string().nullable().default(null),
})

/** Seed payload derived from the persisted model without Directus-managed audit values. */
export const editorSkillSeedSchema = editorSkillSchema.omit({
	user_created: true,
	date_created: true,
	user_updated: true,
	date_updated: true,
})

/** Fields returned to Studio for rendering available skill actions. */
export const editorSkillMenuItemSchema = editorSkillSchema.pick({
	id: true,
	name: true,
	description: true,
	icon: true,
	scopes: true,
	archived: true,
	sort: true,
})

/** Fields read by the endpoint when executing a stored skill. */
export const editorSkillExecutionSchema = editorSkillSchema.pick({
	prompt: true,
	scopes: true,
	archived: true,
})

export type EditorSkillScope = z.output<typeof editorSkillScopeSchema>
export type EditorSkill = z.output<typeof editorSkillSchema>
export type EditorSkillMenuItem = z.output<typeof editorSkillMenuItemSchema>
export type EditorSkillSeed = z.input<typeof editorSkillSeedSchema>
export type NormalizedEditorSkillSeed = z.output<typeof editorSkillSeedSchema>
