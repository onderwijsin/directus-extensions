import { ForbiddenError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import { attempt, isDefined } from '@onderwijsin/directus-extension-utils'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { envSchema } from './env.schema'
import {
	collectPolicies,
	getAccountability,
	nestedRoleFields,
	parseDepth,
	POLICY_FIELDS,
	type RoleRecord,
	type UserRecord,
	walkRole,
} from './helpers'

const EXTENSION_NAME = 'policies_endpoint'

const handler = defineEndpoint((router, { services, getSchema, env, logger }) => {
	const setup = extensionSetup(EXTENSION_NAME, env, logger)
	setup.start()

	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(env, envSchema, logger)
	if (!options.POLICIES_ENDPOINT_ENABLED) return

	router.get('/me/policies', (request, response, next) => {
		void attempt(async () => {
			const accountability = getAccountability(request)
			if (!accountability?.user) throw new ForbiddenError()

			const schema = await getSchema()
			const users = new services.ItemsService<UserRecord>('users', {
				schema,
				accountability,
			})

			const depth = parseDepth(request.query)
			const user = await users.readOne(accountability.user, {
				fields: [
					...POLICY_FIELDS.map((field) => `policies.${field}`),
					'role.id',
					...(depth === undefined
						? []
						: nestedRoleFields(depth).map((field) => `role.${field}`)),
				],
			})

			if (depth !== undefined) {
				response.json(collectPolicies(user))
				return
			}

			const roles = new services.ItemsService<RoleRecord>('roles', {
				schema,
				accountability,
			})
			const policies = new Map(user.policies.map((policy) => [policy.id, policy]))

			if (user.role?.id) {
				await walkRole(roles, user.role.id, policies, new Set<string>())
			}

			response.json([...policies.values()])
		}).then((result) => {
			if (isDefined(result.error) && result.error !== null) next(result.error)
		})
	})

	setup.end()
})

export default {
	id: 'users',
	handler,
}

export { collectPolicies, nestedRoleFields, parseDepth, walkRole }
