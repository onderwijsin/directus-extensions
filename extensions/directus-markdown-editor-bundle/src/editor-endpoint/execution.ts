import type { Accountability, ApiExtensionContext, SchemaOverview } from '@directus/types'
import type { EditorAiRequest } from './request'

import { attempt } from '@onderwijsin/directus-extension-utils'

import { EDITOR_SKILLS_COLLECTION, editorSkillExecutionSchema } from '../shared/editor-skill'
import { EditorAiInvalidPayloadError, EditorAiUnavailableError, toEditorAiError } from './errors'
import { generateEditorReplacement, type EditorAiProviderOptions } from './provider'

interface ResolveEditorAiTaskInput {
	accountability: Accountability
	request: EditorAiRequest
	services: ApiExtensionContext['services']
	schema: SchemaOverview
}

interface GenerateEditorAiContentInput {
	logger: ApiExtensionContext['logger']
	provider: EditorAiProviderOptions
	request: EditorAiRequest
	task: string
	tools: unknown
}

/**
 * Resolves an ad-hoc prompt or an authorized stored editor skill to one task string.
 * @param input - Validated request and Directus service context.
 * @returns Task instruction for the AI provider.
 */
export async function resolveEditorAiTask(input: ResolveEditorAiTaskInput): Promise<string> {
	const skillId = input.request.skillId
	if (!skillId) return input.request.prompt ?? ''

	const skillResult = await attempt(() =>
		new input.services.ItemsService(EDITOR_SKILLS_COLLECTION, {
			schema: input.schema,
			accountability: input.accountability,
		}).readOne(skillId, { fields: ['prompt', 'scopes', 'archived'] }),
	)
	if (skillResult.error || skillResult.data === null) throw toEditorAiError(skillResult.error)
	const parsedSkill = editorSkillExecutionSchema.safeParse(skillResult.data)
	if (!parsedSkill.success)
		throw new EditorAiUnavailableError({
			reason: 'The selected editor skill has an invalid stored shape.',
		})
	if (parsedSkill.data.archived || !parsedSkill.data.scopes.includes(input.request.scope))
		throw new EditorAiInvalidPayloadError({
			reason: 'The selected skill is unavailable for this scope',
		})

	return parsedSkill.data.prompt
}

/**
 * Generates editor content while preserving the endpoint's safe provider error contract.
 * @param input - Provider, request, task, tools, and logger dependencies.
 * @returns Generated Markdown content.
 */
export async function generateEditorAiContent(
	input: GenerateEditorAiContentInput,
): Promise<string> {
	const generated = await attempt(() =>
		generateEditorReplacement(
			input.provider,
			input.task,
			input.request.content,
			input.request.components,
			input.tools,
			input.request.scope,
			input.request.insertion,
		),
	)
	if (generated.error) {
		input.logger.error(generated.error)
		throw toEditorAiError(generated.error)
	}
	if (!generated.data)
		throw new EditorAiUnavailableError({
			reason: 'Editor AI provider configuration is incomplete.',
		})

	return generated.data
}
