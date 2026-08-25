import type { AbstractService, OperationContext } from '@directus/types'
import type { LoopsLmxAst } from '@onderwijsin/loops-core'

/** The Directus fields used by campaign ingestion and archive rendering. */
export interface DirectusCampaign {
	id: string
	loops_campaign_id: string
	loops_email_message_id: string
	campaign_name: string | null
	mailing_list_ids: string[] | null
	sent_at: string | null
	subject: string | null
	preview_text: string | null
	from_name: string | null
	from_email: string | null
	reply_to_email: string | null
	cc_email: string | null
	bcc_email: string | null
	language_code: string | null
	email_format: 'styled' | 'plain' | null
	raw_loops_response: unknown
	raw_lmx: string | null
	loops_ast: LoopsLmxAst | null
	loops_updated_at: string | null
	ingestion_status: string | null
	ingestion_error: string | null
	processing_started_at: string | null
}

/** The Directus fields used by recipient ingestion. */
export interface DirectusRecipient {
	id: string
	campaign: string
	directus_user: string | null
	loops_contact_id: string
	loops_email_id: string
	email: string
	sent_at: string
}

export type CampaignService = Pick<
	AbstractService<DirectusCampaign>,
	'readByQuery' | 'readOne' | 'createOne' | 'updateOne'
>

export type RecipientsService = Pick<
	AbstractService<DirectusRecipient>,
	'readByQuery' | 'createOne'
>

type ServiceContext = Pick<OperationContext, 'services' | 'getSchema'>

/**
 * Creates an accountability-free, strongly typed campaign service.
 * @param context - Directus service constructors and schema access.
 * @param collection - Campaign collection name.
 * @returns A typed campaign service.
 */
export async function createCampaignService(
	context: ServiceContext,
	collection: string,
): Promise<AbstractService<DirectusCampaign>> {
	const schema = await context.getSchema()
	return new context.services.ItemsService<DirectusCampaign>(collection, {
		schema,
		accountability: null,
	})
}

/**
 * Creates an accountability-free, strongly typed recipient service.
 * @param context - Directus service constructors and schema access.
 * @param collection - Recipient collection name.
 * @returns A typed recipient service.
 */
export async function createRecipientsService(
	context: ServiceContext,
	collection: string,
): Promise<AbstractService<DirectusRecipient>> {
	const schema = await context.getSchema()
	return new context.services.ItemsService<DirectusRecipient>(collection, {
		schema,
		accountability: null,
	})
}
