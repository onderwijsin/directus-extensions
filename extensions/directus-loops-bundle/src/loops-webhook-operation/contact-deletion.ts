import type { UserService } from './services'

export interface LoopsContactDeletedEvent {
	contactIdentity: {
		userId: string | null
	}
}

export interface ContactDeletionResult {
	directusUserId: string | null
	updated: boolean
}

/**
 * Disables profile synchronization after Loops deletes a contact.
 *
 * The update is deliberately performed by primary key and is idempotent. A
 * missing Directus user is acknowledged as a no-op, while database failures
 * are allowed to reject the Flow and therefore remain retryable.
 *
 * @param users - Accountability-free Directus users service.
 * @param fieldName - Configured synchronization flag field.
 * @param event - Validated Loops contact deletion event.
 * @returns Whether an existing Directus user was updated.
 */
export const disableDeletedContactSync = async (
	users: UserService,
	fieldName: string,
	event: LoopsContactDeletedEvent,
): Promise<ContactDeletionResult> => {
	const directusUserId = event.contactIdentity.userId
	if (!directusUserId) return { directusUserId: null, updated: false }

	const records = await users.readByQuery({
		filter: { id: { _eq: directusUserId } },
		fields: ['id'],
		limit: 1,
	})
	if (records.length === 0) return { directusUserId, updated: false }

	await users.updateOne(directusUserId, { [fieldName]: false })

	return { directusUserId, updated: true }
}
