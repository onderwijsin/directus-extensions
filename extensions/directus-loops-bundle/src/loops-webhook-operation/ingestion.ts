import type { OperationContext } from '@directus/types'
import type { LoopsEnv } from '../loops-webhook-hook/env.schema'
import type {
	CampaignService,
	DirectusCampaign,
	DirectusRecipient,
	RecipientsService,
} from './services'

import { InternalServerError, InvalidPayloadError } from '@directus/errors'
import {
	loopsLmxAstSchema,
	parseLoopsLmx,
	type LoopsLmxAst,
	type LoopsLmxDiagnostic,
	type LoopsWebhook,
} from '@onderwijsin/loops-core'
import { z } from 'zod'

import { createLoopsClient } from '../shared/client'
import { createCampaignService, createRecipientsService } from './services'

export type CampaignEmailSent = Extract<LoopsWebhook, { eventName: 'campaign.email.sent' }>

interface CampaignQuery {
	where(column: string, value: unknown): CampaignQuery
	update(input: Record<string, unknown>): Promise<number>
}

export type CampaignDatabase = (collection: string) => CampaignQuery

const emailMessageSchema = z.object({
	id: z.string().min(1),
	campaignId: z.string().min(1).optional(),
	subject: z.string(),
	previewText: z.string(),
	fromName: z.string(),
	fromEmail: z.string(),
	replyToEmail: z.string(),
	ccEmail: z.string().optional(),
	bccEmail: z.string().optional(),
	languageCode: z.string().optional(),
	emailFormat: z.enum(['styled', 'plain']),
	lmx: z.string(),
	updatedAt: z.string(),
})

const rawLmxSchema = z.object({ lmx: z.string() }).passthrough()

export type CampaignRecord = Pick<
	DirectusCampaign,
	| 'id'
	| 'loops_campaign_id'
	| 'loops_email_message_id'
	| 'ingestion_status'
	| 'processing_started_at'
>

export const ingestionCampaignRecordSchema: z.ZodType<CampaignRecord> = z.object({
	id: z.string().min(1),
	loops_campaign_id: z.string().min(1),
	loops_email_message_id: z.string().min(1),
	ingestion_status: z.string().nullable(),
	processing_started_at: z.string().nullable(),
})

type EmailMessage = z.infer<typeof emailMessageSchema>

export type CampaignIngestionStatus = 'processing' | 'success' | 'partial' | 'failed'
export type LmxParsingMode = 'best_effort' | 'strict'

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

type CampaignContentFields = Omit<
	DirectusCampaign,
	| 'id'
	| 'loops_campaign_id'
	| 'loops_email_message_id'
	| 'campaign_name'
	| 'mailing_list_ids'
	| 'sent_at'
	| 'ingestion_status'
	| 'ingestion_error'
	| 'processing_started_at'
>

export type CampaignContentUpdate = Partial<CampaignContentFields> & {
	ingestion_status: CampaignIngestionStatus
	ingestion_error: string | null
	processing_started_at: string
}

export type RecipientInput = Omit<DirectusRecipient, 'id'>

export interface CampaignIngestionDependencies {
	campaigns: CampaignService
	recipients: RecipientsService
	database: CampaignDatabase
	campaignCollection: string
	fetchEmailMessage: (emailMessageId: string) => Promise<unknown>
	parseLmx?: (
		lmx: string,
		onDiagnostic: (diagnostic: LoopsLmxDiagnostic) => void,
	) => Promise<unknown>
	resolveDirectusUser?: (userId: string) => Promise<string | null>
	now?: () => Date
	processingLeaseMs?: number
	lmxParsingMode?: LmxParsingMode
}

type IngestionContext = Pick<OperationContext, 'database' | 'getSchema' | 'services'>

/**
 * Creates a configured campaign ingestion function for one Directus operation invocation.
 * @param context - Directus operation context.
 * @param options - Validated Loops environment options.
 * @returns A function that ingests one validated campaign webhook.
 */
export async function createCampaignIngestion(
	context: IngestionContext,
	options: LoopsEnv,
): Promise<(event: CampaignEmailSent) => Promise<CampaignIngestionResult>> {
	const loops = createLoopsClient(options)
	const campaigns = await createCampaignService(context, options.LOOPS_CAMPAIGNS_COLLECTION)
	const recipients = await createRecipientsService(
		context,
		options.LOOPS_CAMPAIGN_RECIPIENTS_COLLECTION,
	)
	const schema = await context.getSchema()
	const users = new context.services.UsersService({ schema, accountability: null })

	const dependencies: CampaignIngestionDependencies = {
		campaigns,
		recipients,
		database: context.database,
		campaignCollection: options.LOOPS_CAMPAIGNS_COLLECTION,
		processingLeaseMs: options.LOOPS_CAMPAIGN_PROCESSING_LEASE_MS,
		lmxParsingMode: options.LOOPS_LMX_PARSING_MODE,
		/**
		 * Fetches the canonical email message from Loops.
		 * @param emailMessageId - Loops email-message identifier.
		 * @returns The email-message response.
		 */
		fetchEmailMessage: (emailMessageId) => loops.getEmailMessage(emailMessageId),
		/**
		 * Resolves an optional Directus user relationship.
		 * @param userId - Directus user identifier from the webhook.
		 * @returns The user identifier when it exists, otherwise null.
		 */
		resolveDirectusUser: async (userId) => {
			try {
				await users.readOne(userId, { fields: ['id'] })
				return userId
			} catch {
				return null
			}
		},
	}

	return (event) => ingestCampaignEmailSent(event, dependencies)
}

const campaignFields = [
	'id',
	'loops_campaign_id',
	'loops_email_message_id',
	'ingestion_status',
	'processing_started_at',
]

/**
 *
 */
/**
 * Validates a campaign record returned by Directus.
 * @param record - Raw Directus record.
 * @returns The validated campaign record.
 */
const parseCampaignRecord = (record: unknown): CampaignRecord => {
	const result = ingestionCampaignRecordSchema.safeParse(record)
	if (!result.success)
		throw new InvalidPayloadError({ reason: 'Invalid Loops campaign record in Directus' })
	return result.data
}

/**
 *
 */
/**
 * Finds and validates a campaign using either stable Loops identity.
 * @param service - Typed Directus campaign service.
 * @param loopsCampaignId - Loops campaign identifier.
 * @param loopsEmailMessageId - Loops email-message identifier.
 * @returns The matching campaign, if present.
 */
const findCampaignByIdentity = async (
	service: CampaignService,
	loopsCampaignId: string,
	loopsEmailMessageId: string,
): Promise<CampaignRecord | null> => {
	const records = await service.readByQuery({
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
	return record === undefined ? null : parseCampaignRecord(record)
}

/**
 *
 */
/**
 * Creates and reads back a campaign processing claim.
 * @param service - Typed Directus campaign service.
 * @param input - Campaign claim fields.
 * @returns The validated campaign record.
 */
const createCampaignClaim = async (
	service: CampaignService,
	input: CampaignClaimInput,
): Promise<CampaignRecord> => {
	const id = await service.createOne(input)
	return parseCampaignRecord(await service.readOne(id, { fields: campaignFields }))
}

/**
 *
 */
/**
 * Atomically reclaims a stale campaign processing lease.
 * @param database - Directus database handle.
 * @param collection - Campaign collection name.
 * @param id - Directus campaign identifier.
 * @param expectedProcessingStartedAt - Previously observed lease timestamp.
 * @param processingStartedAt - Replacement lease timestamp.
 * @returns Whether this request won the reclaim race.
 */
const claimStaleCampaign = async (
	database: CampaignDatabase,
	collection: string,
	id: string,
	expectedProcessingStartedAt: string,
	processingStartedAt: string,
): Promise<boolean> => {
	const updated = await database(collection)
		.where('id', id)
		.where('ingestion_status', 'processing')
		.where('processing_started_at', expectedProcessingStartedAt)
		.update({
			ingestion_status: 'processing',
			ingestion_error: null,
			processing_started_at: processingStartedAt,
		})
	return updated > 0
}

/**
 *
 */
/**
 * Updates materialized campaign state.
 * @param service - Typed Directus campaign service.
 * @param id - Directus campaign identifier.
 * @param input - Campaign state to persist.
 * @returns A promise that resolves after the update.
 */
const updateCampaign = async (
	service: CampaignService,
	id: string,
	input: CampaignContentUpdate,
): Promise<void> => {
	await service.updateOne(id, input)
}

/**
 *
 */
/**
 * Finds a recipient by its unique Loops email identifier.
 * @param service - Typed Directus recipient service.
 * @param loopsEmailId - Loops email identifier.
 * @returns The matching recipient, if present.
 */
const findRecipientByEmailId = async (
	service: RecipientsService,
	loopsEmailId: string,
): Promise<{ id: string } | null> => {
	const records = await service.readByQuery({
		filter: { loops_email_id: { _eq: loopsEmailId } },
		fields: ['id'],
		limit: 1,
	})
	const record = records[0]
	return record === undefined ? null : { id: String(record.id) }
}

/**
 *
 */
/**
 * Creates a recipient snapshot.
 * @param service - Typed Directus recipient service.
 * @param input - Recipient snapshot fields.
 * @returns The created recipient identifier.
 */
const createRecipient = async (
	service: RecipientsService,
	input: RecipientInput,
): Promise<{ id: string }> => ({ id: String(await service.createOne(input)) })

export interface CampaignIngestionResult {
	ignored: boolean
	claimedCampaign: boolean
	campaignId: string | null
	recipientId: string | null
	status: CampaignIngestionStatus | 'ignored'
}

/**
 * Parses LMX without enabling component network access.
 * @param lmx - Raw LMX document.
 * @param onDiagnostic - Diagnostic collector.
 * @returns Parsed LMX AST.
 */
const defaultParseLmx = async (
	lmx: string,
	onDiagnostic: (diagnostic: LoopsLmxDiagnostic) => void,
): Promise<LoopsLmxAst> => parseLoopsLmx(lmx, { onDiagnostic })

/**
 * Validates the parser output before it becomes durable archive data.
 * @param ast - Parser output.
 * @returns Validated LMX AST.
 */
const validateLmxAst = (ast: unknown): LoopsLmxAst => {
	const result = loopsLmxAstSchema.safeParse(ast)
	if (!result.success)
		throw new InvalidPayloadError({ reason: 'Loops LMX parser returned an invalid AST' })
	return result.data
}

/**
 * Checks whether a processing claim is still inside its lease.
 * @param record - Existing campaign record.
 * @param now - Current time.
 * @param processingLeaseMs - Lease duration.
 * @returns Whether the claim remains fresh.
 */
const isFreshProcessingClaim = (
	record: CampaignRecord,
	now: Date,
	processingLeaseMs: number,
): boolean => {
	if (record.ingestion_status !== 'processing' || !record.processing_started_at) return false
	const startedAt = Date.parse(record.processing_started_at)
	return Number.isFinite(startedAt) && now.getTime() - startedAt < processingLeaseMs
}

/**
 * Converts an unknown failure into a bounded persisted message.
 * @param error - Failure value.
 * @returns Bounded error message.
 */
const failureMessage = (error: unknown): string => {
	const message = error instanceof Error ? error.message : 'Unknown ingestion failure'
	return message.slice(0, 2_000)
}

/**
 * Normalizes a persisted status to the ingestion result contract.
 * @param value - Persisted status.
 * @returns Normalized ingestion status.
 */
const materializedStatus = (value: string | null | undefined): CampaignIngestionStatus => {
	if (value === 'success' || value === 'partial' || value === 'failed') return value
	return 'processing'
}

/**
 * Claims a campaign without holding a lock across external work.
 * @param event - Validated campaign event.
 * @param dependencies - Persistence dependencies.
 * @param now - Current time.
 * @returns Campaign claim and ownership state.
 */
const claimCampaign = async (
	event: CampaignEmailSent,
	dependencies: CampaignIngestionDependencies,
	now: Date,
): Promise<{ record: CampaignRecord; owner: boolean; startedAt: string }> => {
	const startedAt = now.toISOString()
	const processingLeaseMs = dependencies.processingLeaseMs ?? 300_000
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
		dependencies.campaigns,
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
			dependencies.database,
			dependencies.campaignCollection,
			existing.id,
			existing.processing_started_at ?? '',
			startedAt,
		)
		if (!reclaimed) {
			const current = await findCampaignByIdentity(
				dependencies.campaigns,
				event.campaignId,
				event.email.emailMessageId,
			)
			if (current) return { record: current, owner: false, startedAt }
			throw new InternalServerError()
		}
		return { record: existing, owner: true, startedAt }
	}

	try {
		const record = await createCampaignClaim(dependencies.campaigns, input)
		return { record, owner: true, startedAt }
	} catch (error) {
		const racedRecord = await findCampaignByIdentity(
			dependencies.campaigns,
			event.campaignId,
			event.email.emailMessageId,
		)
		if (racedRecord) return { record: racedRecord, owner: false, startedAt }
		throw error
	}
}

/**
 * Persists one recipient with duplicate-delivery protection.
 * @param event - Validated campaign event.
 * @param campaignId - Directus campaign record identifier.
 * @param dependencies - Persistence dependencies.
 * @returns Existing or newly created recipient.
 */
const persistRecipient = async (
	event: CampaignEmailSent,
	campaignId: string,
	dependencies: CampaignIngestionDependencies,
): Promise<{ id: string } | null> => {
	const existing = await findRecipientByEmailId(dependencies.recipients, event.email.id)
	if (existing) return existing

	const directusUser = event.contactIdentity.userId
		? ((await dependencies.resolveDirectusUser?.(event.contactIdentity.userId)) ?? null)
		: null
	const input: RecipientInput = {
		campaign: campaignId,
		directus_user: directusUser,
		loops_contact_id: event.contactIdentity.id,
		loops_email_id: event.email.id,
		email: event.contactIdentity.email,
		sent_at: new Date(event.eventTime * 1_000).toISOString(),
	}

	try {
		return await createRecipient(dependencies.recipients, input)
	} catch (error) {
		const racedRecipient = await findRecipientByEmailId(dependencies.recipients, event.email.id)
		if (racedRecipient) return racedRecipient
		throw error
	}
}

/**
 * Maps a Loops response and parsed AST into campaign archive fields.
 * @param message - Validated Loops email-message response.
 * @param rawResponse - Original Loops response.
 * @param rawLmx - Original LMX document.
 * @param ast - Validated parsed AST.
 * @param diagnostics - Parser diagnostics.
 * @param startedAt - Processing claim timestamp.
 * @returns Directus campaign update payload.
 */
const contentUpdate = (
	message: EmailMessage,
	rawResponse: unknown,
	rawLmx: string,
	ast: LoopsLmxAst,
	diagnostics: LoopsLmxDiagnostic[],
	startedAt: string,
): CampaignContentUpdate => ({
	subject: message.subject,
	preview_text: message.previewText,
	from_name: message.fromName,
	from_email: message.fromEmail,
	reply_to_email: message.replyToEmail,
	...(message.ccEmail === undefined ? {} : { cc_email: message.ccEmail }),
	...(message.bccEmail === undefined ? {} : { bcc_email: message.bccEmail }),
	...(message.languageCode === undefined ? {} : { language_code: message.languageCode }),
	email_format: message.emailFormat,
	raw_loops_response: rawResponse,
	raw_lmx: rawLmx,
	loops_ast: ast,
	loops_updated_at: message.updatedAt,
	ingestion_status: diagnostics.length > 0 ? 'partial' : 'success',
	ingestion_error:
		diagnostics.length > 0
			? diagnostics
					.map((diagnostic) => diagnostic.message)
					.join('\n')
					.slice(0, 2_000)
			: null,
	processing_started_at: startedAt,
})

/**
 * Ingests one campaign send webhook without holding a database claim over network or parsing work.
 *
 * @param event - Validated campaign send event.
 * @param dependencies - Persistence and Loops API dependencies.
 * @returns Ingestion outcome.
 */
export async function ingestCampaignEmailSent(
	event: CampaignEmailSent,
	dependencies: CampaignIngestionDependencies,
): Promise<CampaignIngestionResult> {
	const now = dependencies.now ?? (() => new Date())
	const claim = await claimCampaign(event, dependencies, now())
	let recipient: { id: string } | null
	try {
		recipient = await persistRecipient(event, claim.record.id, dependencies)
	} catch (error) {
		if (claim.owner) {
			await updateCampaign(dependencies.campaigns, claim.record.id, {
				ingestion_status: 'failed',
				ingestion_error: failureMessage(error),
				processing_started_at: claim.startedAt,
			})
		}
		throw error
	}

	if (!claim.owner) {
		return {
			ignored: false,
			claimedCampaign: false,
			campaignId: claim.record.id,
			recipientId: recipient?.id ?? null,
			status: materializedStatus(claim.record.ingestion_status),
		}
	}

	let rawResponse: unknown
	let rawLmx: string | undefined
	try {
		rawResponse = await dependencies.fetchEmailMessage(event.email.emailMessageId)
		const rawLmxResult = rawLmxSchema.safeParse(rawResponse)
		if (rawLmxResult.success) rawLmx = rawLmxResult.data.lmx
		const parsedMessageResult = emailMessageSchema.safeParse(rawResponse)
		if (!parsedMessageResult.success)
			throw new InvalidPayloadError({ reason: 'Invalid Loops email message response' })
		const parsedMessage = parsedMessageResult.data
		if (
			parsedMessage.campaignId !== undefined &&
			parsedMessage.campaignId !== event.campaignId
		) {
			throw new InvalidPayloadError({
				reason: 'Loops email message belongs to a different campaign',
			})
		}

		const diagnostics: LoopsLmxDiagnostic[] = []
		const parseLmx = dependencies.parseLmx ?? defaultParseLmx
		const ast = validateLmxAst(
			await parseLmx(parsedMessage.lmx, (diagnostic) => diagnostics.push(diagnostic)),
		)
		if (dependencies.lmxParsingMode === 'strict' && diagnostics.length > 0)
			throw new InvalidPayloadError({
				reason: 'LMX parsing produced diagnostics in strict mode',
			})
		await updateCampaign(
			dependencies.campaigns,
			claim.record.id,
			contentUpdate(
				parsedMessage,
				rawResponse,
				parsedMessage.lmx,
				ast,
				diagnostics,
				claim.startedAt,
			),
		)
		return {
			ignored: false,
			claimedCampaign: true,
			campaignId: claim.record.id,
			recipientId: recipient?.id ?? null,
			status: diagnostics.length > 0 ? 'partial' : 'success',
		}
	} catch (error) {
		const message = failureMessage(error)
		const update: CampaignContentUpdate = {
			ingestion_status: 'failed',
			ingestion_error: message,
			processing_started_at: claim.startedAt,
			...(rawResponse === undefined ? {} : { raw_loops_response: rawResponse }),
			...(rawLmx === undefined ? {} : { raw_lmx: rawLmx }),
		}
		await updateCampaign(dependencies.campaigns, claim.record.id, update)
		throw error
	}
}
