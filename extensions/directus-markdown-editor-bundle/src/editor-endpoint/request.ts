import { isDefined } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import { editorSkillScopeSchema } from '../shared/editor-skill'

const editorAiComponentSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2_000).optional(),
	nodeType: z.enum(['block', 'inline']),
	props: z.array(z.string().min(1).max(200)).max(100),
	slots: z.array(z.string().min(1).max(200)).max(100),
})

export const editorAiRequestSchema = z
	.object({
		scope: editorSkillScopeSchema,
		content: z.string(),
		skillId: z.uuid().optional(),
		prompt: z.string().trim().min(1).max(10_000).optional(),
		selection: z
			.object({
				from: z.number().int().nonnegative(),
				to: z.number().int().positive(),
				text: z.string().min(1),
			})
			.optional(),
		collection: z.string().trim().min(1),
		field: z.string().trim().min(1),
		components: z.array(editorAiComponentSchema).max(200).optional(),
	})
	.superRefine((value, context) => {
		if (isDefined(value.skillId) === isDefined(value.prompt))
			context.addIssue({
				code: 'custom',
				message: 'Provide exactly one of skillId or prompt',
			})
		if (
			value.scope === 'selection' &&
			(!value.selection ||
				value.selection.from >= value.selection.to ||
				value.selection.text !== value.content)
		)
			context.addIssue({
				code: 'custom',
				message: 'Selection scope requires a valid selection matching content',
			})
		if (value.scope === 'document' && isDefined(value.selection))
			context.addIssue({
				code: 'custom',
				message: 'Document scope does not accept selection',
			})
	})

export type EditorAiRequest = z.infer<typeof editorAiRequestSchema>
