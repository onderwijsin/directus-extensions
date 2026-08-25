/* oxlint-disable typescript/require-await -- async mocks match the production dependency contracts. */

import type { LoopsLmxAst, LoopsWebhook } from '@onderwijsin/loops-core'
import type {
	CampaignService,
	DirectusCampaign,
	DirectusRecipient,
	RecipientsService,
} from '../src/loops-webhook-operation/services'

import { loopsWebhookSchema } from '@onderwijsin/loops-core'
import { describe, expect, it, vi } from 'vitest'

import {
	type CampaignIngestionDependencies,
	type CampaignRecord,
	ingestCampaignEmailSent,
} from '../src/loops-webhook-operation/ingestion'
import payload from './fixtures/campaign-email-sent.json'

type CampaignEmailSent = Extract<LoopsWebhook, { eventName: 'campaign.email.sent' }>

const isCampaignEmailSent = (event: unknown): event is CampaignEmailSent =>
	typeof event === 'object' &&
	event !== null &&
	'eventName' in event &&
	event.eventName === 'campaign.email.sent' &&
	'campaignId' in event &&
	'campaignName' in event &&
	'email' in event

const event = loopsWebhookSchema.parse(payload)
if (!isCampaignEmailSent(event)) throw new Error('Fixture is not a campaign event')
const campaignEvent: CampaignEmailSent = event
const now = new Date('2026-08-25T12:00:00.000Z')
const ast: LoopsLmxAst = { type: 'root', children: [] }
const message = {
	id: campaignEvent.email.emailMessageId,
	campaignId: campaignEvent.campaignId,
	subject: 'Test Subject',
	previewText: 'Preview',
	fromName: 'Loops',
	fromEmail: 'hello',
	replyToEmail: 'support@example.com',
	emailFormat: 'styled',
	lmx: '<Paragraph>Hello</Paragraph>',
	updatedAt: '2026-08-25T11:00:00.000Z',
}

const record = (status: string, startedAt: string | null = null): CampaignRecord => ({
	id: 'directus-campaign-id',
	loops_campaign_id: campaignEvent.campaignId,
	loops_email_message_id: campaignEvent.email.emailMessageId,
	ingestion_status: status,
	processing_started_at: startedAt,
})

type FindCampaign = (
	loopsCampaignId: string,
	loopsEmailMessageId: string,
) => Promise<CampaignRecord | null>
type CreateClaim = (input: unknown) => Promise<CampaignRecord>
type UpdateCampaign = (id: string, input: unknown) => Promise<void>
type FindRecipient = (loopsEmailId: string) => Promise<{ id: string } | null>
type CreateRecipient = (input: unknown) => Promise<{ id: string }>
type ClaimStale = () => Promise<boolean>

type TestCampaignService = CampaignService & { update: CampaignService['updateOne'] }
type TestRecipientsService = RecipientsService & { create: RecipientsService['createOne'] }
type TestDependencies = Omit<CampaignIngestionDependencies, 'campaigns' | 'recipients'> & {
	campaigns: TestCampaignService
	recipients: TestRecipientsService
}

const directusCampaign = (value: CampaignRecord): DirectusCampaign => ({
	...value,
	ingestion_status: value.ingestion_status ?? null,
	processing_started_at: value.processing_started_at ?? null,
	campaign_name: null,
	mailing_list_ids: null,
	sent_at: now.toISOString(),
	subject: null,
	preview_text: null,
	from_name: null,
	from_email: null,
	reply_to_email: null,
	cc_email: null,
	bcc_email: null,
	language_code: null,
	email_format: null,
	raw_loops_response: null,
	raw_lmx: null,
	loops_ast: null,
	loops_updated_at: null,
	ingestion_error: null,
})

const directusRecipient = (value: { id: string }): DirectusRecipient => ({
	...value,
	campaign: 'directus-campaign-id',
	directus_user: null,
	loops_contact_id: 'loops-contact-id',
	loops_email_id: campaignEvent.email.id,
	email: campaignEvent.contactIdentity.email,
	sent_at: now.toISOString(),
})

const createDependencies = (
	findCampaign: FindCampaign = vi.fn(async () => null),
	createClaim: CreateClaim = vi.fn(async () => record('processing', now.toISOString())),
	updateCampaign: UpdateCampaign = vi.fn(async () => undefined),
	findRecipient: FindRecipient = vi.fn(async () => null),
	createRecipient: CreateRecipient = vi.fn(async () => ({ id: 'recipient-id' })),
	fetchEmailMessage: CampaignIngestionDependencies['fetchEmailMessage'] = vi.fn(
		async () => message,
	),
	parseLmx: NonNullable<CampaignIngestionDependencies['parseLmx']> = vi.fn(
		async (_lmx, _onDiagnostic) => ast,
	),
	claimStale: ClaimStale = vi.fn(async () => true),
): TestDependencies => ({
	campaigns: (() => {
		let createdRecord: CampaignRecord | null = null
		const readByQuery = vi.fn(async () => {
			const existing = await findCampaign('', '')
			return existing === null ? [] : [directusCampaign(existing)]
		})
		const createOne = vi.fn(async (input: unknown) => {
			createdRecord = await createClaim(input)
			return createdRecord.id
		})
		const updateOne = vi.fn(async (id: string, input: unknown) => {
			await updateCampaign(id, input)
			return id
		})
		const service: TestCampaignService = {
			readByQuery,
			readOne: vi.fn(async () =>
				directusCampaign(createdRecord ?? record('processing', now.toISOString())),
			),
			createOne,
			updateOne,
			update: updateOne,
		}
		return service
	})(),
	recipients: (() => {
		const readByQuery = vi.fn(async () => {
			const existing = await findRecipient('')
			return existing === null ? [] : [directusRecipient(existing)]
		})
		const createOne = vi.fn(async (input: unknown) => (await createRecipient(input)).id)
		const service: TestRecipientsService = { readByQuery, createOne, create: createOne }
		return service
	})(),
	database: (() => {
		const query = {
			where: vi.fn(() => query),
			update: vi.fn(async () => ((await claimStale()) ? 1 : 0)),
		}
		return vi.fn(() => query)
	})(),
	campaignCollection: 'loops_campaigns',
	fetchEmailMessage,
	parseLmx,
	now: () => now,
})

describe('campaign ingestion', () => {
	it('claims, fetches, parses, persists, and completes a new campaign', async () => {
		const dependencies = createDependencies()

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).resolves.toMatchObject({
			claimedCampaign: true,
			status: 'success',
			recipientId: 'recipient-id',
		})
		expect(dependencies.fetchEmailMessage).toHaveBeenCalledWith(
			campaignEvent.email.emailMessageId,
		)
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.campaigns.update).toHaveBeenCalledWith(
			'directus-campaign-id',
			expect.objectContaining({
				raw_loops_response: message,
				raw_lmx: message.lmx,
				loops_ast: ast,
				ingestion_status: 'success',
			}),
		)
	})

	it.each([
		['completed campaign', record('success')],
		['partially completed campaign', record('partial')],
		['fresh processing claim', record('processing', now.toISOString())],
	])('persists the recipient without refetching for a %s', async (_label, existing) => {
		const findCampaign = vi.fn(async () => existing)
		const dependencies = createDependencies(findCampaign)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).resolves.toMatchObject({
			claimedCampaign: false,
			campaignId: existing.id,
		})
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.fetchEmailMessage).not.toHaveBeenCalled()
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.recipients.create).toHaveBeenCalledOnce()
	})

	it('reclaims a stale processing campaign and preserves its recipients', async () => {
		const stale = record('processing', '2026-08-25T11:00:00.000Z')
		const claimStale = vi.fn(async () => true)
		const dependencies = createDependencies(
			vi.fn(async () => stale),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			claimStale,
		)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).resolves.toMatchObject({
			claimedCampaign: true,
			status: 'success',
		})
		expect(claimStale).toHaveBeenCalledOnce()
	})

	it('treats a lost stale-claim race as a recipient-only delivery', async () => {
		const stale = record('processing', '2026-08-25T11:00:00.000Z')
		const fresh = record('processing', now.toISOString())
		const findCampaign = vi
			.fn<FindCampaign>()
			.mockResolvedValueOnce(stale)
			.mockResolvedValueOnce(fresh)
		const claimStale = vi.fn(async () => false)
		const dependencies = createDependencies(
			findCampaign,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			claimStale,
		)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).resolves.toMatchObject({
			claimedCampaign: false,
			campaignId: fresh.id,
		})
		expect(claimStale).toHaveBeenCalledOnce()
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.fetchEmailMessage).not.toHaveBeenCalled()
	})

	it('treats a campaign claim uniqueness race as an expected concurrent delivery', async () => {
		const raced = record('processing', now.toISOString())
		const findCampaign = vi
			.fn<FindCampaign>()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(raced)
		const createClaim = vi.fn<CreateClaim>().mockRejectedValue(new Error('unique'))
		const dependencies = createDependencies(findCampaign, createClaim)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).resolves.toMatchObject({
			claimedCampaign: false,
			campaignId: raced.id,
		})
		expect(dependencies.fetchEmailMessage).not.toHaveBeenCalled()
	})

	it('treats a duplicate recipient race as an expected concurrent delivery', async () => {
		const findRecipient = vi
			.fn<FindRecipient>()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ id: 'raced-recipient' })
		const createRecipient = vi.fn<CreateRecipient>().mockRejectedValue(new Error('unique'))
		const dependencies = createDependencies(
			undefined,
			undefined,
			undefined,
			findRecipient,
			createRecipient,
		)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).resolves.toMatchObject({
			recipientId: 'raced-recipient',
			status: 'success',
		})
	})

	it('marks ingestion failed and rethrows when Loops fetch fails', async () => {
		const fetchEmailMessage = vi
			.fn<CampaignIngestionDependencies['fetchEmailMessage']>()
			.mockRejectedValue(new Error('Loops unavailable'))
		const dependencies = createDependencies(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			fetchEmailMessage,
		)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).rejects.toThrow(
			'Loops unavailable',
		)
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.campaigns.update).toHaveBeenLastCalledWith(
			'directus-campaign-id',
			expect.objectContaining({
				ingestion_status: 'failed',
				ingestion_error: 'Loops unavailable',
			}),
		)
	})

	it('retains the raw response and marks invalid email content failed', async () => {
		const invalidMessage = { ...message, subject: undefined }
		const fetchEmailMessage = vi.fn(async () => invalidMessage)
		const dependencies = createDependencies(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			fetchEmailMessage,
		)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).rejects.toThrow()
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.campaigns.update).toHaveBeenLastCalledWith(
			'directus-campaign-id',
			expect.objectContaining({
				raw_loops_response: invalidMessage,
				raw_lmx: message.lmx,
				ingestion_status: 'failed',
			}),
		)
	})

	it('rejects a fetched message belonging to another campaign', async () => {
		const dependencies = createDependencies(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			vi.fn(async () => ({ ...message, campaignId: 'different-campaign' })),
		)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).rejects.toThrow(
			'different campaign',
		)
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.campaigns.update).toHaveBeenLastCalledWith(
			'directus-campaign-id',
			expect.objectContaining({ ingestion_status: 'failed' }),
		)
	})

	it('marks diagnostic-bearing LMX as partial while retaining the AST', async () => {
		const parseLmx = vi.fn<NonNullable<CampaignIngestionDependencies['parseLmx']>>()
		parseLmx.mockImplementation(async (_lmx, onDiagnostic) => {
			onDiagnostic({ code: 'unsupported_tag', message: 'Unsupported tag' })
			return ast
		})
		const dependencies = createDependencies(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			parseLmx,
		)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).resolves.toMatchObject({
			status: 'partial',
		})
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.campaigns.update).toHaveBeenLastCalledWith(
			'directus-campaign-id',
			expect.objectContaining({ ingestion_status: 'partial', loops_ast: ast }),
		)
	})

	it('marks parsing failures failed', async () => {
		const parseLmx = vi
			.fn<NonNullable<CampaignIngestionDependencies['parseLmx']>>()
			.mockRejectedValue(new Error('parser failed'))
		const dependencies = createDependencies(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			parseLmx,
		)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).rejects.toThrow(
			'parser failed',
		)
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.campaigns.update).toHaveBeenLastCalledWith(
			'directus-campaign-id',
			expect.objectContaining({ ingestion_status: 'failed', raw_lmx: message.lmx }),
		)
	})

	it('fails strict parsing on diagnostics while retaining raw content', async () => {
		const parseLmx = vi.fn<NonNullable<CampaignIngestionDependencies['parseLmx']>>()
		parseLmx.mockImplementation(async (_lmx, onDiagnostic) => {
			onDiagnostic({ code: 'unsupported_tag', message: 'Unsupported tag' })
			return ast
		})
		const dependencies = createDependencies(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			parseLmx,
		)
		dependencies.lmxParsingMode = 'strict'

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).rejects.toThrow(
			'strict mode',
		)
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.campaigns.update).toHaveBeenLastCalledWith(
			'directus-campaign-id',
			expect.objectContaining({ ingestion_status: 'failed', raw_lmx: message.lmx }),
		)
	})

	it('rejects an invalid AST returned by a custom parser', async () => {
		const parseLmx = vi
			.fn<NonNullable<CampaignIngestionDependencies['parseLmx']>>()
			.mockResolvedValue({ type: 'invalid' })
		const dependencies = createDependencies(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			parseLmx,
		)

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).rejects.toThrow(
			'invalid AST',
		)
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.campaigns.update).toHaveBeenLastCalledWith(
			'directus-campaign-id',
			expect.objectContaining({ ingestion_status: 'failed' }),
		)
	})

	it('does not silently reuse a conflicting campaign identity', async () => {
		const conflicting = { ...record('success'), loops_email_message_id: 'other-message' }
		const dependencies = createDependencies(vi.fn(async () => conflicting))

		await expect(ingestCampaignEmailSent(campaignEvent, dependencies)).rejects.toThrow(
			'conflicts',
		)
		// oxlint-disable-next-line typescript/unbound-method
		expect(dependencies.recipients.create).not.toHaveBeenCalled()
	})
})
