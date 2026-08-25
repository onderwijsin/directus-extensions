import type { OperationContext } from '@directus/types'
import type { LoopsWebhook } from '@onderwijsin/loops-core'
import type { LoopsClient } from 'loops'
import type { LoopsEnv } from '../../shared/env.schema'
import type { UserService, CampaignService, DirectusCampaign, RecipientsService } from '../services'

import { z } from 'zod'

export type CampaignEmailSent = Extract<LoopsWebhook, { eventName: 'campaign.email.sent' }>

export const rawLmxSchema = z.object({ lmx: z.string() })

const ingestionStatus = ['processing', 'success', 'partial', 'failed'] as const

export type CampaignIngestionStatus = (typeof ingestionStatus)[number]

export type CampaignClaimInput = Pick<
	DirectusCampaign,
	'loops_campaign_id' | 'loops_email_message_id'
> & {
	campaign_name: string
	mailing_list_ids: string[]
	sent_at: string
	ingestion_status: 'processing'
	processing_started_at: string
}

export interface CampaignIngestionDependencies {
	campaigns: CampaignService
	recipients: RecipientsService
	users: UserService
	loops: LoopsClient
	database: OperationContext['database']
	options: LoopsEnv
}

export interface CampaignIngestionResult {
	ignored: boolean
	claimedCampaign: boolean
	campaignId: string | null
	recipientId: string | null
	status: CampaignIngestionStatus | 'ignored'
}
