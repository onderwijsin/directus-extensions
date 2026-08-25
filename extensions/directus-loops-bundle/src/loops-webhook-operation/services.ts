import type {
	AbstractService,
	OperationContext,
	SchemaOverview,
	ExtensionsServices,
} from '@directus/types'
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

export type CampaignService = AbstractService<DirectusCampaign>
export type RecipientsService = AbstractService<DirectusRecipient>
export type UserService = InstanceType<ExtensionsServices['UsersService']>

/**
 * Creates an accountability-free, strongly typed campaign service.
 * @param context - Directus service constructors and schema access.
 * @param collection - Campaign collection name.
 * @param schema - Directus Schema Overview
 * @returns A typed campaign service.
 */
export async function createCampaignService(
	context: OperationContext,
	collection: string,
	schema?: SchemaOverview,
): Promise<CampaignService> {
	return new context.services.ItemsService<DirectusCampaign>(collection, {
		schema: schema ?? (await context.getSchema()),
		knex: context.database,
		accountability: null,
	})
}

/**
 * Creates an accountability-free, strongly typed recipient service.
 * @param context - Directus service constructors and schema access.
 * @param collection - Recipient collection name.
 * @param schema - Directus Schema Overview
 * @returns A typed recipient service.
 */
export async function createRecipientsService(
	context: OperationContext,
	collection: string,
	schema?: SchemaOverview,
): Promise<RecipientsService> {
	return new context.services.ItemsService<DirectusRecipient>(collection, {
		schema: schema ?? (await context.getSchema()),
		knex: context.database,
		accountability: null,
	})
}

/**
 * Creates an accountability-free, strongly typed user service.
 * @param context - Directus service constructors and schema access.
 * @param schema - Directus Schema Overview
 * @returns A typed user service.
 *
 * @description this factory is consciously typed as extension of AbstractService, since we
 * dont need the internal UsersService auth operation.
 */
export async function createUsersService(
	context: OperationContext,
	schema?: SchemaOverview,
): Promise<UserService> {
	return new context.services.UsersService({
		knex: context.database,
		schema: schema ?? (await context.getSchema()),
		accountability: null,
	})
}
