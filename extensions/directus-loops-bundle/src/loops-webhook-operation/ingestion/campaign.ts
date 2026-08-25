import type { CampaignService, DirectusCampaign } from '../services'
import type { CampaignClaimInput, CampaignEmailSent, CampaignIngestionDependencies } from './types'

import { InternalServerError, InvalidPayloadError } from '@directus/errors'
import { isDefined, attempt } from '@onderwijsin/directus-extension-utils'

import { isFreshProcessingClaim } from './validation'

const campaignFields = [
	'id',
	'loops_campaign_id',
	'loops_email_message_id',
	'ingestion_status',
	'processing_started_at',
]

/**
 * Finds a campaign using either stable Loops identity.
 * @param dependencies - Campaign persistence dependencies.
 * @param loopsCampaignId - Loops campaign identifier.
 * @param loopsEmailMessageId - Loops email-message identifier.
 * @returns The matching campaign, if present.
 */
export const findCampaignByIdentity = async (
	dependencies: CampaignIngestionDependencies,
	loopsCampaignId: string,
	loopsEmailMessageId: string,
) => {
	const records = await dependencies.campaigns.readByQuery({
		filter: {
			_or: [
				{ loops_campaign_id: { _eq: loopsCampaignId } },
				{ loops_email_message_id: { _eq: loopsEmailMessageId } },
			],
		},
		fields: campaignFields,
		limit: 1,
	})
	const record = records[0]
	return !isDefined(record) ? null : record
}

/**
 * Creates and reads back a campaign processing claim.
 * @param dependencies - Campaign persistence dependencies.
 * @param input - Campaign claim fields.
 * @returns The validated campaign record.
 */
export const createCampaignClaim = async (
	dependencies: CampaignIngestionDependencies,
	input: CampaignClaimInput,
) => {
	const id = await dependencies.campaigns.createOne(input)
	return await dependencies.campaigns.readOne(id)
}
/**
 * Atomically reclaims a stale campaign processing lease.
 * @param campaigns - Directus Service for campaigns collection
 * @param id - Directus campaign identifier.
 * @param expectedProcessingStartedAt - Previously observed lease timestamp.
 * @param processingStartedAt - Replacement lease timestamp.
 * @returns Whether this request won the reclaim race.
 */
export const claimStaleCampaign = async (
	campaigns: CampaignService,
	id: string,
	expectedProcessingStartedAt: string,
	processingStartedAt: string,
): Promise<boolean> => {
	const updated = await campaigns.updateByQuery(
		{
			filter: {
				_and: [
					{ id: { _eq: id } },
					{ processing_started_at: { _eq: expectedProcessingStartedAt } },
					{ ingestion_status: { _eq: 'processing' } },
				],
			},
		},
		{
			ingestion_status: 'processing',
			ingestion_error: null,
			processing_started_at: processingStartedAt,
		},
	)
	return updated.length > 0
}

/**
 * Claims a campaign without holding a database lock over external work.
 * @param event - Validated campaign event.
 * @param dependencies - Campaign persistence dependencies.
 * @param now - Current time.
 * @returns Campaign claim and ownership state.
 */
export const claimCampaign = async (
	event: CampaignEmailSent,
	dependencies: CampaignIngestionDependencies,
	now: Date,
): Promise<{ record: DirectusCampaign; owner: boolean; startedAt: string }> => {
	const startedAt = now.toISOString()
	const processingLeaseMs = dependencies.options.LOOPS_CAMPAIGN_PROCESSING_LEASE_MS

	const input: CampaignClaimInput = {
		loops_campaign_id: event.campaignId,
		loops_email_message_id: event.email.emailMessageId,
		campaign_name: event.campaignName,
		mailing_list_ids: event.mailingLists?.map((list) => list.id) ?? [],
		sent_at: new Date(event.eventTime * 1_000).toISOString(),
		ingestion_status: 'processing',
		processing_started_at: startedAt,
	}

	const existing = await findCampaignByIdentity(
		dependencies,
		event.campaignId,
		event.email.emailMessageId,
	)
	if (existing) {
		if (
			existing.loops_campaign_id !== event.campaignId ||
			existing.loops_email_message_id !== event.email.emailMessageId
		) {
			throw new InvalidPayloadError({
				reason: 'Existing campaign identity conflicts with the Loops webhook',
			})
		}
		if (
			existing.ingestion_status === 'success' ||
			existing.ingestion_status === 'partial' ||
			isFreshProcessingClaim(existing, now, processingLeaseMs)
		) {
			return { record: existing, owner: false, startedAt }
		}

		const reclaimed = await claimStaleCampaign(
			dependencies.campaigns,
			existing.id,
			existing.processing_started_at ?? '',
			startedAt,
		)
		if (!reclaimed) {
			// Check if there was a race condition on the reclaim
			const current = await findCampaignByIdentity(
				dependencies,
				event.campaignId,
				event.email.emailMessageId,
			)
			if (current) return { record: current, owner: false, startedAt }
			throw new InternalServerError()
		}
		return { record: existing, owner: true, startedAt }
	}

	const { data: record, error } = await attempt(() => createCampaignClaim(dependencies, input))

	if (error || !record) {
		// Check whether a race condition applied on claim
		const racedRecord = await findCampaignByIdentity(
			dependencies,
			event.campaignId,
			event.email.emailMessageId,
		)
		if (racedRecord) return { record: racedRecord, owner: false, startedAt }
		throw error
	}

	return { record, owner: true, startedAt }
}
