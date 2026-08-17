import { ForbiddenError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import { attempt, isDefined } from '@onderwijsin/directus-extension-utils'
import { extensionSetup } from '@onderwijsin/directus-extension-utils/server'

import {
	collectPolicies,
	getAccountability,
	nestedRoleFields,
	parseDepth,
	POLICY_FIELDS,
	resolvePolicies,
	type RoleRecord,
	type UserRecord,
	walkRole,
} from './helpers'

const EXTENSION_NAME = 'policies_endpoint'

export default defineEndpoint({
	id: 'users/me',
	/**
	 * Endpoint handler
	 * @param router - The ExpressJS routes
	 * @param context - Directus API Context
	 * @param context.services - Directus Services
	 * @param context.getSchema - Async database schema resolver
	 * @param context.env - Directus Environment
	 * @param context.logger - Pino Logger
	 * @returns void
	 */
	handler: (router, { services, getSchema, env, logger }) => {
		const setup = extensionSetup(EXTENSION_NAME, env, logger)
		setup.start()

		if (!setup.isEnabled()) return

		router.get('/policies', (request, response, next) => {
			void attempt(async () => {
				const accountability = getAccountability(request)
				if (!accountability?.user) throw new ForbiddenError()
				const serviceAccountability = { ...accountability, admin: true }

				const schema = await getSchema()
				const users = new services.ItemsService<UserRecord>('directus_users', {
					schema,
					accountability: serviceAccountability,
				})

				const depth = parseDepth(request.query)
				const user = await users.readOne(accountability.user, {
					fields: [
						...POLICY_FIELDS.map((field) => `policies.policy.${field}`),
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

				const roles = new services.ItemsService<RoleRecord>('directus_roles', {
					schema,
					accountability: serviceAccountability,
				})
				const policies = new Map(
					resolvePolicies(user.policies).map((policy) => [policy.id, policy]),
				)

				if (user.role?.id) {
					await walkRole(roles, user.role.id, policies, new Set<string>())
				}

				response.json([...policies.values()])
			}).then((result) => {
				if (isDefined(result.error) && result.error !== null) next(result.error)
			})
		})

		setup.end()
	},
})

export { collectPolicies, nestedRoleFields, parseDepth, walkRole }
