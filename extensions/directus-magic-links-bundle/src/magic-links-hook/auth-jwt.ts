import type { ApiExtensionContext } from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'

import { isRecord } from '@onderwijsin/directus-extension-utils'

import { getMagicLinkRefreshContext } from '../shared/magic-link-refresh-context'

type Database = ApiExtensionContext['database']
type Filter = RegisterFunctions['filter']

type JwtPayload = Record<string, unknown> & {
	enforce_tfa?: boolean
}

/**
 * Narrows a filter payload to a mutable JWT claim object.
 * @param value - Unknown payload received from Directus.
 * @returns Whether the value is an object suitable for JWT claim updates.
 */
const isJwtPayload = (value: unknown): value is JwtPayload => isRecord(value)

/**
 * Registers the Directus JWT filter used to preserve policy-enforced TFA setup claims.
 * @param filter - Directus hook filter registration function.
 * @param database - Directus database connection.
 * @returns void
 */
export const registerMagicLinkJwt = (filter: Filter, database: Database): void => {
	filter('auth.jwt', async (payload, meta) => {
		const refreshContext = getMagicLinkRefreshContext()

		if (
			!isJwtPayload(payload) ||
			!meta.user ||
			!refreshContext ||
			refreshContext.userId !== meta.user ||
			payload.enforce_tfa === true ||
			meta.type !== 'refresh'
		)
			return payload

		const user = await database('directus_users')
			.select('role', 'tfa_secret')
			.where({ id: meta.user })
			.first<{ role: string | null; tfa_secret: string | null }>()

		if (!user || user.tfa_secret || user.role === null) return payload

		const enforcement = await database('directus_access')
			.innerJoin('directus_policies', 'directus_access.policy', 'directus_policies.id')
			.select('directus_policies.id')
			.where('directus_access.role', user.role)
			.where('directus_policies.enforce_tfa', true)
			.first()

		if (enforcement) payload.enforce_tfa = true
		return payload
	})
}
