import { InternalServerError, InvalidPayloadError } from '@directus/errors'
import { defineOperationApi } from '@directus/extensions-sdk'
import { isRecord } from '@onderwijsin/directus-extension-utils'
import { validateExtensionOptions } from '@onderwijsin/directus-extension-utils/server'
import { loopsWebhookSchema } from '@onderwijsin/loops-core'

import { LOOPS_WEBHOOK_ID_HEADER, LOOPS_WEBHOOK_VERIFIED_HEADER } from '../shared/constants'
import { envSchema } from '../shared/env.schema'
import { disableDeletedContactSync } from './contact-deletion'
import { createCampaignIngestion } from './ingestion'
import { createUsersService } from './services'
import { isCampaignEmailSent, getTriggerHeader } from './utils'

/**
 * Validates that the Loops middleware verified the webhook and forwards the validated event.
 *
 * Campaign content and recipient persistence use independent idempotent writes.
 */
export default defineOperationApi({
	id: 'loops-webhook-handler',
	/**
	 * Checks the middleware verification marker and validates the webhook event.
	 * @param _options - Operation options.
	 * @param context - Directus operation context.
	 * @returns Verified webhook data for downstream Flow operations.
	 */
	handler: async (_options, context) => {
		const options = validateExtensionOptions(context.env, envSchema, context.logger)
		const trigger = isRecord(context.data.$trigger) ? context.data.$trigger : undefined

		const verified = getTriggerHeader(trigger?.headers, LOOPS_WEBHOOK_VERIFIED_HEADER)
		if (verified !== 'true')
			throw new InvalidPayloadError({ reason: 'Loops webhook was not verified' })

		const { data: event, success } = loopsWebhookSchema.safeParse(trigger?.body)
		if (!success) throw new InvalidPayloadError({ reason: 'Invalid Loops webhook event' })

		if (!options.LOOPS_WEBHOOK_EVENT_ALLOWLIST.includes(event.eventName)) {
			return {
				verified: true,
				ignored: true,
				webhookId: getTriggerHeader(trigger?.headers, LOOPS_WEBHOOK_ID_HEADER),
				eventName: event.eventName,
			}
		}

		if (event.eventName === 'contact.deleted') {
			const users = await createUsersService(context, await context.getSchema())
			const result = await disableDeletedContactSync(
				users,
				options.LOOPS_SYNC_ENABLED_FIELD,
				event,
			)
			return {
				verified: true,
				webhookId: getTriggerHeader(trigger?.headers, LOOPS_WEBHOOK_ID_HEADER),
				event,
				...result,
			}
		}

		if (!isCampaignEmailSent(event)) {
			return {
				verified: true,
				ignored: true,
				webhookId: getTriggerHeader(trigger?.headers, LOOPS_WEBHOOK_ID_HEADER),
				eventName: event.eventName,
			}
		}

		if (!options.LOOPS_API_KEY) throw new InternalServerError()
		const ingestCampaign = await createCampaignIngestion(context, options)
		const result = await ingestCampaign(event)
		return {
			verified: true,
			webhookId: getTriggerHeader(trigger?.headers, LOOPS_WEBHOOK_ID_HEADER),
			event,
			...result,
		}
	},
})
