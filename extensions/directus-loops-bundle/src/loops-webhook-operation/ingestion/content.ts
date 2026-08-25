import type { EmailMessageResponse } from 'loops'
import type { DirectusCampaign } from '../services'

import { createError, InvalidPayloadError } from '@directus/errors'
import { attempt } from '@onderwijsin/directus-extension-utils'
import { parseLoopsLmx, type LoopsLmxAst, type LoopsLmxDiagnostic } from '@onderwijsin/loops-core'

import {
	type CampaignEmailSent,
	type CampaignIngestionDependencies,
	type CampaignIngestionStatus,
} from './types'
import { validateLmxAst } from './validation'

/**
 * Maps a Loops response and parsed AST into campaign archive fields.
 * @param message - Loops email-message response.
 * @param ast - Validated parsed AST.
 * @param diagnostics - Parser diagnostics.
 * @param startedAt - Processing claim timestamp.
 * @returns Campaign content update payload.
 */
export const loopsMessageToDirectusCampaign = (
	message: EmailMessageResponse,
	ast: LoopsLmxAst,
	diagnostics: LoopsLmxDiagnostic[],
	startedAt: string,
): Partial<DirectusCampaign> => ({
	subject: message.subject,
	preview_text: message.previewText,
	from_name: message.fromName,
	from_email: message.fromEmail,
	reply_to_email: message.replyToEmail,
	...(message.ccEmail === undefined ? {} : { cc_email: message.ccEmail }),
	...(message.bccEmail === undefined ? {} : { bcc_email: message.bccEmail }),
	...(message.languageCode === undefined ? {} : { language_code: message.languageCode }),
	email_format: message.emailFormat,
	raw_loops_response: message,
	raw_lmx: message.lmx,
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

interface CampaignContentErrorExtensions {
	cause: unknown
	rawResponse: unknown
	rawLmx: string | undefined
}

/** Error raised when Loops campaign content cannot be materialized. */
export const CampaignContentError = createError<CampaignContentErrorExtensions>(
	'LOOPS_CAMPAIGN_CONTENT_FAILED',
	({ cause }) =>
		cause instanceof Error ? cause.message : 'Campaign content materialization failed',
	500,
)

/**
 * Fetches, validates, parses, and materializes the canonical campaign content.
 * @param event - Validated campaign event.
 * @param dependencies - Loops and parser dependencies.
 * @param startedAt - Processing claim timestamp.
 * @returns Materialized campaign content and status.
 */
export const materializeCampaignContent = async (
	event: CampaignEmailSent,
	dependencies: CampaignIngestionDependencies,
	startedAt: string,
) => {
	let emailMessage: EmailMessageResponse
	let rawLmx: string | undefined

	const { data, error } = await attempt(async () => {
		// We are deliberately not parsing / validating the loops response;
		// That is the job of the loops client.
		emailMessage = await dependencies.loops.getEmailMessage(event.email.emailMessageId)
		rawLmx = emailMessage.lmx

		if (emailMessage.campaignId !== undefined && emailMessage.campaignId !== event.campaignId) {
			throw new InvalidPayloadError({
				reason: 'Loops email message belongs to a different campaign',
			})
		}

		const diagnostics: LoopsLmxDiagnostic[] = []
		const ast = validateLmxAst(
			await parseLoopsLmx(emailMessage.lmx, {
				/**
				 * @param diagnostic - LMX diagnostic information.
				 * @returns void
				 */
				onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
				apiKey: dependencies.options.LOOPS_API_KEY,
				emailType: 'campaign',
			}),
		)
		if (dependencies.options.LOOPS_LMX_PARSING_MODE === 'strict' && diagnostics.length > 0)
			throw new InvalidPayloadError({
				reason: 'LMX parsing produced diagnostics in strict mode',
			})

		return {
			update: loopsMessageToDirectusCampaign(emailMessage, ast, diagnostics, startedAt),
			status: (diagnostics.length > 0 ? 'partial' : 'success') as CampaignIngestionStatus,
			rawResponse: emailMessage,
			rawLmx: rawLmx ?? emailMessage.lmx,
		}
	})

	if (!data || error) {
		// @ts-expect-error This is fine
		throw new CampaignContentError({ cause: error, rawResponse: emailMessage, rawLmx })
	}

	return data
}
