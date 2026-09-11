/* eslint-disable jsdoc-js/require-jsdoc -- Endpoint-local guards and route callbacks are private wiring. */
import { defineEndpoint } from '@directus/extensions-sdk'
import { attempt, hasKey, isDefined, isRecord } from '@onderwijsin/directus-extension-utils'
import {
	assertRequestWithAccountability,
	asyncHandler,
	extensionSetup,
	hasPolicies,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import {
	CAN_USE_EDITOR_SKILLS_POLICY_ID,
	EDITOR_SKILLS_COLLECTION,
	editorSkillExecutionSchema,
} from '../shared/editor-skill'
import { isEditorAiAdministrator } from './authorization'
import { envSchema } from './env.schema'
import {
	EditorAiForbiddenError,
	EditorAiInvalidPayloadError,
	EditorAiUnavailableError,
	toEditorAiError,
} from './errors'
import { generateEditorReplacement } from './provider'
import { editorAiRequestSchema } from './request'

export default defineEndpoint({
	id: 'editor',
	handler: (router, { env, logger, services, getSchema }) => {
		const setup = extensionSetup('markdown-editor', env, logger)
		setup.start()
		if (!setup.isEnabled()) return
		const options = validateExtensionOptions(env, envSchema, logger)

		router.post(
			'/ai',
			asyncHandler(async (request, response) => {
				// Reject anonymous calls before parsing or touching Directus services.
				if (!assertRequestWithAccountability(request))
					throw new EditorAiForbiddenError({
						reason: 'The Can Use Editor Skills policy is required.',
					})
				const accountability = request.accountability
				const parsed = editorAiRequestSchema.safeParse(request.body)
				if (!parsed.success)
					throw new EditorAiInvalidPayloadError({
						reason: parsed.error.issues.map((issue) => issue.message).join('; '),
					})
				// Apply one size limit to replacement content and full insert-document context.
				const inputLength =
					parsed.data.content?.length ?? parsed.data.insertion?.document.length ?? 0
				if (inputLength > options.EDITOR_AI_MAX_CONTENT_LENGTH)
					throw new EditorAiInvalidPayloadError({
						reason: 'Content exceeds the configured limit',
					})
				// Provider credentials are server-only and all three values are required together.
				if (
					!isDefined(options.EDITOR_AI_PROVIDER) ||
					!isDefined(options.EDITOR_AI_API_KEY) ||
					!isDefined(options.EDITOR_AI_MODEL)
				)
					throw new EditorAiUnavailableError({
						reason: 'Editor AI provider configuration is incomplete.',
					})
				const provider = options.EDITOR_AI_PROVIDER
				const apiKey = options.EDITOR_AI_API_KEY
				const model = options.EDITOR_AI_MODEL

				const schema = await getSchema()
				// Administrators bypass the seeded policy; regular users must be assigned to it.
				const isAdmin = isEditorAiAdministrator(accountability)
				const isAllowed =
					isAdmin ||
					(await hasPolicies(
						accountability,
						CAN_USE_EDITOR_SKILLS_POLICY_ID,
						services,
						schema,
						null,
						null,
					))
				if (!isAllowed)
					throw new EditorAiForbiddenError({
						reason: 'The Can Use Editor Skills policy is required.',
					})

				const input = parsed.data
				// Read the actual field configuration instead of trusting client-supplied capabilities.
				const fieldResult = await attempt(() =>
					new services.FieldsService({ schema, accountability }).readOne(
						input.collection,
						input.field,
					),
				)
				if (fieldResult.error || fieldResult.data === null)
					throw toEditorAiError(fieldResult.error)
				const interfaceOptions = fieldResult.data.meta?.options
				if (
					fieldResult.data.meta?.interface !== 'markdown-editor' ||
					!isRecord(interfaceOptions) ||
					interfaceOptions.ai !== true
				)
					throw new EditorAiForbiddenError({
						reason: 'Editor AI is not enabled for this field.',
					})
				const configuredTools = hasKey(interfaceOptions, 'tools')
					? interfaceOptions.tools
					: undefined

				// Resolve a stored skill into the same task string used by an ad-hoc prompt.
				let task = input.prompt
				const skillId = input.skillId
				if (skillId) {
					const skillResult = await attempt(() =>
						new services.ItemsService(EDITOR_SKILLS_COLLECTION, {
							schema,
							accountability,
						}).readOne(skillId, { fields: ['prompt', 'scopes', 'archived'] }),
					)
					if (skillResult.error || skillResult.data === null)
						throw toEditorAiError(skillResult.error)
					const parsedSkill = editorSkillExecutionSchema.safeParse(skillResult.data)
					if (!parsedSkill.success)
						throw new EditorAiUnavailableError({
							reason: 'The selected editor skill has an invalid stored shape.',
						})
					if (parsedSkill.data.archived || !parsedSkill.data.scopes.includes(input.scope))
						throw new EditorAiInvalidPayloadError({
							reason: 'The selected skill is unavailable for this scope',
						})
					task = parsedSkill.data.prompt
				}

				// Keep provider failures inside the extension's stable Directus error contract.
				const generated = await attempt(() =>
					generateEditorReplacement(
						{
							provider,
							apiKey,
							model,
							...(options.EDITOR_AI_BASE_URL
								? { baseURL: options.EDITOR_AI_BASE_URL }
								: {}),
						},
						task ?? '',
						input.content,
						input.components,
						configuredTools,
						input.scope,
						input.insertion,
					),
				)
				if (generated.error) {
					logger.error(generated.error)
					throw toEditorAiError(generated.error)
				}
				if (!generated.data)
					throw new EditorAiUnavailableError({
						reason: 'Editor AI provider configuration is incomplete.',
					})
				response.json({ content: generated.data })
			}),
		)
		setup.end()
	},
})
