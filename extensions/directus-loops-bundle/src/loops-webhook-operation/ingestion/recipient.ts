import type { DirectusRecipient } from '../services'
import type { CampaignEmailSent, CampaignIngestionDependencies } from './types'

import { attempt, isDefined } from '@onderwijsin/directus-extension-utils'

/**
 * Finds a recipient by its unique Loops email identifier.
 * @param dependencies - Recipient persistence dependencies.
 * @param loopsEmailId - Loops email identifier.
 * @returns The matching recipient, if present.
 */
export const findRecipientByEmailId = async (
	dependencies: CampaignIngestionDependencies,
	loopsEmailId: string,
): Promise<{ id: string } | null> => {
	const records = await dependencies.recipients.readByQuery({
		filter: { loops_email_id: { _eq: loopsEmailId } },
		fields: ['id'],
		limit: 1,
	})
	const record = records[0]
	return !isDefined(record) ? null : { id: String(record.id) }
}

/**
 * Persists one recipient with duplicate-delivery protection.
 * @param event - Validated campaign event.
 * @param campaignId - Directus campaign record identifier.
 * @param dependencies - Persistence and user-resolution dependencies.
 * @returns Existing or newly created recipient.
 */
export const persistRecipient = async (
	event: CampaignEmailSent,
	campaignId: string,
	dependencies: CampaignIngestionDependencies,
): Promise<{ id: string } | null> => {
	const existing = await findRecipientByEmailId(dependencies, event.email.id)
	if (existing) return existing

	const directusUser = event.contactIdentity.userId
		? ((await dependencies.users.readOne(event.contactIdentity.userId, { fields: ['id'] })) ??
			null)
		: null

	const input: Omit<DirectusRecipient, 'id'> = {
		campaign: campaignId,
		directus_user: directusUser?.id,
		loops_contact_id: event.contactIdentity.id,
		loops_email_id: event.email.id,
		email: event.contactIdentity.email,
		sent_at: new Date(event.eventTime * 1_000).toISOString(),
	}

	const { data, error } = await attempt(() => dependencies.recipients.createOne(input))

	if (!data || error) {
		const racedRecipient = await findRecipientByEmailId(dependencies, event.email.id)
		if (racedRecipient) return racedRecipient
		throw error
	}

	return { id: String(data) }
}
