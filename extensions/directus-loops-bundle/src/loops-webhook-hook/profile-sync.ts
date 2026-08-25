import type { ApiExtensionContext, User } from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
import type { LoopsClient } from 'loops'
import type { LoopsEnv } from '../shared/env.schema'

import {
	attempt,
	hasKey,
	isArray,
	isPrimaryKey,
	isRecord,
	isString,
} from '@onderwijsin/directus-extension-utils'

export type ContactProperty = string | number | boolean | null
export interface ContactUpdate {
	userId: string
	email?: string
	properties: Record<string, ContactProperty>
}
const profileFields = ['email', 'first_name', 'last_name']
const userFields = ['id', ...profileFields]

export interface DirectusLoopsUser extends Record<string, unknown> {
	id: string
	email: string | null
	first_name: string | null
	last_name: string | null
}

/**
 * Determines whether a Directus update is eligible for profile synchronization.
 * @param payload - Partial user update payload.
 * @param user - User state after the update.
 * @param syncEnabledField - Configured opt-in field name.
 * @returns Whether the update should be sent to Loops.
 */
export const shouldSyncUserUpdate = (
	payload: Record<string, unknown>,
	user: DirectusLoopsUser,
	syncEnabledField: string,
): boolean =>
	user[syncEnabledField] === true &&
	((hasKey(payload, syncEnabledField) && payload[syncEnabledField] === true) ||
		profileFields.some((field) => hasKey(payload, field)))

/**
 * Maps a Directus user to the official Loops contact update shape.
 * @param user - Validated Directus user.
 * @returns Loops contact update addressed by Directus user ID.
 */
export const toLoopsContactUpdate = (user: DirectusLoopsUser): ContactUpdate => {
	const properties: Record<string, ContactProperty> = {
		firstName: user.first_name,
		lastName: user.last_name,
	}
	return {
		userId: user.id,
		...(isString(user.email) && user.email.trim().length > 0 ? { email: user.email } : {}),
		properties,
	}
}

/**
 * Extracts Directus primary keys from an action metadata object.
 * @param meta - Directus action metadata.
 * @returns Supported primary keys from the update.
 */
const getActionKeys = (meta: Record<string, unknown>): (string | number)[] => {
	const keys = isArray(meta.keys) ? meta.keys.filter(isPrimaryKey) : []
	if (keys.length > 0) return keys
	return isPrimaryKey(meta.key) ? [meta.key] : []
}

/**
 * Registers best-effort profile synchronization for Directus user updates.
 * @param action - Directus action registration function.
 * @param client - Loops contact client.
 * @param context - The Directus Hook context
 * @param env - Validated Loops environment configuration.
 * @returns Nothing.
 */
export const registerLoopsProfileSyncHook = (
	action: RegisterFunctions['action'],
	client: Pick<LoopsClient, 'updateContact'>,
	context: ApiExtensionContext,
	env: LoopsEnv,
): void => {
	/**
	 * Synchronizes eligible user updates.
	 * @param meta - Directus item-update metadata.
	 * @returns A promise completed after eligible updates are sent.
	 */
	action('users.update', async (meta: Record<string, unknown>) => {
		if (meta.collection !== 'directus_users') return
		const payload = meta.payload
		if (!isRecord(payload)) return
		if (
			!hasKey(payload, env.LOOPS_SYNC_ENABLED_FIELD) &&
			!profileFields.some((field) => hasKey(payload, field))
		)
			return

		const keys = getActionKeys(meta)
		if (keys.length === 0) return

		const fields = [...new Set([...userFields, env.LOOPS_SYNC_ENABLED_FIELD])]

		const service = new context.services.UsersService({
			knex: context.database,
			schema: await context.getSchema(),
		})
		// Yes directus types SUCK BALLS. This type cast is fine. Not our problem
		const users = (await service.readMany(keys, { fields })) as User[]

		for (const user of users) {
			if (!shouldSyncUserUpdate(payload, user, env.LOOPS_SYNC_ENABLED_FIELD)) continue

			const { error } = await attempt(() => client.updateContact(toLoopsContactUpdate(user)))
			if (error) {
				context.logger.error({
					msg: 'Unable to synchronize Directus user profile with Loops',
					userId: user.id,
					error,
				})
			}
		}
	})
}
