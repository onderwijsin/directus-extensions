import { InvalidPayloadError } from '@directus/errors'
import { defineOperationApi } from '@directus/extensions-sdk'
import { attempt, isDefined } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import { centroidOptionsSchema } from './utils/options.schema'
import { transformPayload } from './utils/transform'

/** Registers the offline polygon payload transform. */
export default defineOperationApi({
	id: 'geo-calculate-centroid-operation',
	/**
	 * Validates Flow options and returns the complete transformed payload.
	 * @param options - Resolved operation options.
	 * @param context - Flow data chain for the default trigger payload.
	 * @returns Complete transformed item or array.
	 */
	handler: async (options, context) => {
		const parsed = centroidOptionsSchema.safeParse(options)
		if (!parsed.success)
			throw new InvalidPayloadError({
				reason: `Invalid polygon options: ${z.prettifyError(parsed.error)}`,
			})
		const trigger = z.object({ payload: z.unknown() }).safeParse(context.data.$trigger)
		const payload =
			!isDefined(parsed.data.payload) && trigger.success
				? trigger.data.payload
				: parsed.data.payload
		const result = await attempt(() => transformPayload(payload, parsed.data))
		if (result.error !== null)
			throw new InvalidPayloadError({
				reason:
					result.error instanceof Error
						? result.error.message
						: 'Invalid polygon payload',
			})
		return result.data
	},
})
