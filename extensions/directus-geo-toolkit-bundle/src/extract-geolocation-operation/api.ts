import { InvalidPayloadError } from '@directus/errors'
import { defineOperationApi } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import { extractionOptionsSchema } from './utils/options.schema'
import { transformPayload } from './utils/transform'

/** Registers the offline address payload transform. */
export default defineOperationApi({
	id: 'geo-extract-geolocation-operation',
	/**
	 * Validates configuration and returns the complete transformed item payload.
	 * @param options - Resolved Flow options, including payload.
	 * @param context - Flow data chain used for the default trigger payload.
	 * @returns Transformed item or batch.
	 */
	handler: async (options, context) => {
		const parsed = extractionOptionsSchema.safeParse(options)
		if (!parsed.success)
			throw new InvalidPayloadError({
				reason: `Invalid extraction options: ${z.prettifyError(parsed.error)}`,
			})
		const trigger = z.object({ payload: z.unknown() }).safeParse(context.data.$trigger)
		const result = await attempt(() =>
			transformPayload(
				parsed.data.payload === undefined && trigger.success
					? trigger.data.payload
					: parsed.data.payload,
				parsed.data,
			),
		)
		if (result.error !== null)
			throw new InvalidPayloadError({
				reason:
					result.error instanceof Error
						? result.error.message
						: 'Invalid extraction payload',
			})
		return result.data
	},
})
