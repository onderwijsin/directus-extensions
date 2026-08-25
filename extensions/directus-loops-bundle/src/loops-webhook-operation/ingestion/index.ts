import type { OperationContext } from '@directus/types'
import type { LoopsEnv } from '../../shared/env.schema'
import type {
	CampaignEmailSent,
	CampaignIngestionDependencies,
	CampaignIngestionResult,
} from './types'

import { attempt } from '@onderwijsin/directus-extension-utils'

import { createLoopsClient } from '../../shared/client'
import { createCampaignService, createRecipientsService, createUsersService } from '../services'
import { claimCampaign } from './campaign'
import { CampaignContentError, materializeCampaignContent } from './content'
import { persistRecipient } from './recipient'
import { failureMessage, materializedStatus } from './validation'

export * from './types'

/**
 * Creates a configured campaign ingestion function for one Directus operation invocation.
 * @param context - Directus operation context.
 * @param options - Validated Loops environment options.
 * @returns A function that ingests one validated campaign webhook.
 */
export async function createCampaignIngestion(
	context: OperationContext,
	options: LoopsEnv,
): Promise<(event: CampaignEmailSent) => Promise<CampaignIngestionResult>> {
	const loops = createLoopsClient(options)
	const schema = await context.getSchema()

	const campaigns = await createCampaignService(
		context,
		options.LOOPS_CAMPAIGNS_COLLECTION,
		schema,
	)
	const recipients = await createRecipientsService(
		context,
		options.LOOPS_CAMPAIGN_RECIPIENTS_COLLECTION,
		schema,
	)
	const users = await createUsersService(context, schema)

	return (event) =>
		ingestCampaignEmail(event, {
			campaigns,
			recipients,
			users,
			loops,
			database: context.database,
			options,
		})
}

/**
 * Ingests one campaign send webhook without holding a database claim over network or parsing work.
 * @param event - Validated campaign send event.
 * @param dependencies - Persistence and Loops API dependencies.
 * @returns Ingestion outcome.
 */
async function ingestCampaignEmail(
	event: CampaignEmailSent,
	dependencies: CampaignIngestionDependencies,
): Promise<CampaignIngestionResult> {
	const { campaigns } = dependencies
	const claim = await claimCampaign(event, dependencies, new Date())

	const { data: recipient, error: recipientError } = await attempt(() =>
		persistRecipient(event, claim.record.id, dependencies),
	)

	if (!recipient || recipientError) {
		if (claim.owner) {
			await campaigns.updateOne(claim.record.id, {
				ingestion_status: 'failed',
				ingestion_error: failureMessage(recipientError),
				processing_started_at: claim.startedAt,
			})
		}
		throw recipientError
	}

	// If this event is not the owner of the claim, return and skip further processing
	if (!claim.owner) {
		return {
			ignored: false,
			claimedCampaign: false,
			campaignId: claim.record.id,
			recipientId: recipient?.id ?? null,
			status: materializedStatus(claim.record.ingestion_status),
		}
	}

	const { data, error } = await attempt(async () => {
		const content = await materializeCampaignContent(event, dependencies, claim.startedAt)
		await campaigns.updateOne(claim.record.id, content.update)

		return {
			ignored: false,
			claimedCampaign: true,
			campaignId: claim.record.id,
			recipientId: recipient?.id ?? null,
			status: content.status,
		}
	})

	if (!data || error) {
		const contentError = error instanceof CampaignContentError ? error : undefined
		const cause = contentError?.extensions.cause ?? error
		const update = {
			ingestion_status: 'failed' as const,
			ingestion_error: failureMessage(cause),
			processing_started_at: claim.startedAt,
			...(contentError?.extensions.rawResponse === undefined
				? {}
				: { raw_loops_response: contentError.extensions.rawResponse }),
			...(contentError?.extensions.rawLmx === undefined
				? {}
				: { raw_lmx: contentError.extensions.rawLmx }),
		}
		await campaigns.updateOne(claim.record.id, update)
		throw cause
	}

	return data
}
