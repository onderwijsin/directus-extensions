import type { Accountability, ApiExtensionContext, SchemaOverview } from '@directus/types'

import { attempt, hasKey, isRecord } from '@onderwijsin/directus-extension-utils'
import { hasPolicies } from '@onderwijsin/directus-extension-utils/server'

import { CAN_USE_EDITOR_SKILLS_POLICY_ID } from '../shared/editor-skill'
import { isEditorAiAdministrator } from './authorization'
import { EditorAiForbiddenError, toEditorAiError } from './errors'

interface EditorAiAccessInput {
	accountability: Accountability
	services: ApiExtensionContext['services']
	schema: SchemaOverview
}

interface EditorAiFieldInput extends EditorAiAccessInput {
	collection: string
	field: string
}

/**
 * Requires the seeded editor-skill policy for non-administrator requests.
 * @param input - Request accountability and Directus service context.
 * @returns Nothing.
 */
export async function assertEditorAiAccess(input: EditorAiAccessInput): Promise<void> {
	const isAllowed =
		isEditorAiAdministrator(input.accountability) ||
		(await hasPolicies(
			input.accountability,
			CAN_USE_EDITOR_SKILLS_POLICY_ID,
			input.services,
			input.schema,
			null,
			null,
		))
	if (!isAllowed)
		throw new EditorAiForbiddenError({
			reason: 'The Can Use Editor Skills policy is required.',
		})
}

/**
 * Reads and validates the target Markdown field's AI capability.
 * @param input - Field identity, accountability, and Directus service context.
 * @returns Interface-level authoring tools supplied to the system prompt.
 */
export async function readEditorAiFieldTools(input: EditorAiFieldInput): Promise<unknown> {
	const fieldResult = await attempt(() =>
		new input.services.FieldsService({
			schema: input.schema,
			accountability: input.accountability,
		}).readOne(input.collection, input.field),
	)
	if (fieldResult.error || fieldResult.data === null) throw toEditorAiError(fieldResult.error)

	const interfaceOptions = fieldResult.data.meta?.options
	if (
		fieldResult.data.meta?.interface !== 'markdown-editor' ||
		!isRecord(interfaceOptions) ||
		interfaceOptions.ai !== true
	)
		throw new EditorAiForbiddenError({ reason: 'Editor AI is not enabled for this field.' })

	return hasKey(interfaceOptions, 'tools') ? interfaceOptions.tools : undefined
}
