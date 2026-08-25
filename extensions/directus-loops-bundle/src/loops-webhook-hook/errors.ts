import { createError } from '@directus/errors'

/** Error returned when a Loops webhook signature cannot be verified. */
export const InvalidWebhookSignature = createError(
	'LOOPS_WEBHOOK_SIGNATURE_INVALID',
	'Invalid Loops webhook signature',
	401,
)
