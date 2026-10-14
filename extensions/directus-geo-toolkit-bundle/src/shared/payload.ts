import type { polygonPayloadOptionsSchema } from './payload.schema'

import { attemptSync, hasKey, isArray, isDefined } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

const itemSchema = z.record(z.string(), z.unknown())

/**
 * Extends each incoming item with one derived geometry without modifying its source.
 * @param payload - Resolved item or array of items.
 * @param options - Validated source, destination and overwrite policies.
 * @param calculate - Pure geometry calculation for a non-null source.
 * @returns Complete payload in its original shape and order.
 */
export function transformGeometryPayload(
	payload: unknown,
	options: z.infer<typeof polygonPayloadOptionsSchema>,
	calculate: (source: unknown) => unknown,
) {
	/**
	 * Validates one item and applies its source and overwrite policies.
	 * @param input - Incoming item.
	 * @param index - Index used in errors.
	 * @returns Complete transformed item.
	 */
	const transformItem = (input: unknown, index: number) => {
		const parsed = itemSchema.safeParse(input)
		if (!parsed.success) throw new Error(`Item ${index}: expected an object payload`)
		const item = parsed.data
		const source = item[options.inputField]
		if (!isDefined(source)) {
			if (options.missingInput === 'error')
				throw new Error(`Item ${index}: missing source field`)
			return item
		}
		if (source === null && options.nullInput !== 'clear') {
			if (options.nullInput === 'error') throw new Error(`Item ${index}: null source field`)
			return item
		}
		const result = attemptSync(() => (source === null ? null : calculate(source)))
		if (result.error !== null)
			throw new Error(
				`Item ${index}: ${result.error instanceof Error ? result.error.message : 'Invalid polygon'}`,
			)
		const value = result.data
		const current = item[options.outputField]
		if (options.overwrite === 'preserve-input' && hasKey(item, options.outputField)) return item
		if (
			options.overwrite === 'fill-empty' &&
			current !== null &&
			isDefined(current) &&
			current !== ''
		)
			return item
		return { ...item, [options.outputField]: value }
	}
	return isArray(payload) ? payload.map(transformItem) : transformItem(payload, 0)
}
