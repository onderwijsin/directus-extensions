import { isDefined } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import { EDITOR_AI_INSERTION_MARKER } from '../shared/editor-ai'
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
		content: z.string().optional(),
		skillId: z.uuid().optional(),
		prompt: z.string().trim().min(1).max(10_000).optional(),
		selection: z
			.object({
				from: z.number().int().nonnegative(),
				to: z.number().int().positive(),
				text: z.string().min(1),
			})
			.optional(),
		insertion: z
			.object({
				position: z.number().int().positive(),
				document: z.string().min(1),
			})
			.optional(),
		collection: z.string().trim().min(1),
		field: z.string().trim().min(1),
		components: z.array(editorAiComponentSchema).max(200).optional(),
	})
	.superRefine((value, context) => {
		// Requests choose either a managed skill or an ad-hoc prompt, never both or neither.
		if (isDefined(value.skillId) === isDefined(value.prompt))
			context.addIssue({
				code: 'custom',
				message: 'Provide exactly one of skillId or prompt',
			})
		// Selection coordinates are client bookmarks; content must mirror the serialized selection.
		if (
			value.scope === 'selection' &&
			(!isDefined(value.content) ||
				!value.selection ||
				value.selection.from >= value.selection.to ||
				value.selection.text !== value.content)
		)
			context.addIssue({
				code: 'custom',
				message: 'Selection scope requires a valid selection matching content',
			})
		// Document mode operates on content alone and must not carry range-specific state.
		if (value.scope === 'document' && isDefined(value.selection))
			context.addIssue({
				code: 'custom',
				message: 'Document scope does not accept selection',
			})
		if (value.scope === 'document' && !isDefined(value.content))
			context.addIssue({ code: 'custom', message: 'Document scope requires content' })
		// Insertion context is exclusive to insert mode so providers cannot receive surplus data.
		if (value.scope !== 'insert' && isDefined(value.insertion))
			context.addIssue({
				code: 'custom',
				message: 'Only insert scope accepts insertion context',
			})
		// Exactly one marker makes the insertion point unambiguous in the complete Markdown document.
		if (
			value.scope === 'insert' &&
			(value.insertion?.document.split(EDITOR_AI_INSERTION_MARKER).length !== 2 ||
				isDefined(value.content) ||
				isDefined(value.selection))
		)
			context.addIssue({
				code: 'custom',
				message:
					'Insert scope requires document context with one insertion marker and does not accept replacement content',
			})
	})

export type EditorAiRequest = z.infer<typeof editorAiRequestSchema>
