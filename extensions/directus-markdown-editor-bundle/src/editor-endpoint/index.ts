/* eslint-disable jsdoc-js/require-jsdoc -- Endpoint-local guards and route callbacks are private wiring. */
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	assertRequestWithAccountability,
	asyncHandler,
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { assertEditorAiAccess, readEditorAiFieldTools } from './access'
import { resolveEditorAiProvider } from './config'
import { envSchema } from './env.schema'
import { EditorAiForbiddenError } from './errors'
import { generateEditorAiContent, resolveEditorAiTask } from './execution'
import { parseEditorAiInput } from './input'

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
				if (!assertRequestWithAccountability(request))
					throw new EditorAiForbiddenError({
						reason: 'The Can Use Editor Skills policy is required.',
					})
				const accountability = request.accountability
				const input = parseEditorAiInput(request.body, options.EDITOR_AI_MAX_CONTENT_LENGTH)
				const schema = await getSchema()
				await assertEditorAiAccess({ accountability, services, schema })
				const tools = await readEditorAiFieldTools({
					accountability,
					services,
					schema,
					collection: input.collection,
					field: input.field,
				})
				const provider = await resolveEditorAiProvider({ options, services, schema })
				const task = await resolveEditorAiTask({
					accountability,
					request: input,
					services,
					schema,
				})
				const content = await generateEditorAiContent({
					logger,
					provider,
					request: input,
					task,
					tools,
				})
				response.json({ content })
			}),
		)
		setup.end()
	},
})
