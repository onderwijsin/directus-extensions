import { isRecord, isString, hasKey } from '@onderwijsin/directus-extension-utils'
import { type LoopsWebhook } from '@onderwijsin/loops-core'
type CampaignEmailSent = Extract<LoopsWebhook, { eventName: 'campaign.email.sent' }>

/**
 * Narrows the validated union to campaign delivery events.
 * @param event - Parsed webhook event.
 * @returns Whether the event contains campaign delivery fields.
 */
export const isCampaignEmailSent = (event: unknown): event is CampaignEmailSent =>
	isRecord(event) &&
	event.eventName === 'campaign.email.sent' &&
	hasKey(event, 'campaignId') &&
	hasKey(event, 'campaignName') &&
	hasKey(event, 'email')

/**
 * Reads an internal webhook header from Flow trigger data.
 * @param headers - Trigger headers.
 * @param name - Header name.
 * @returns Header value when present and textual.
 */
export const getTriggerHeader = (headers: unknown, name: string): string | undefined => {
	if (!headers || !isRecord(headers)) return undefined
	const value = hasKey(headers, name) ? Reflect.get(headers, name) : undefined
	return isString(value) ? value : undefined
}
