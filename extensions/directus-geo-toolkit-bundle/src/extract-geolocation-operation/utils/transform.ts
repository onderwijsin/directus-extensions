import type { ExtractionOptions } from './types'

import { toEntries, isArray, isDefined } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import { extractValues } from './extract'

const itemSchema = z.record(z.string(), z.unknown())

/**
 * Checks whether a destination may be written under the selected overwrite policy.
 * @param item - Original incoming item.
 * @param destination - Destination field key.
 * @param policy - Configured overwrite policy.
 * @returns Whether extraction may write the field.
 */
function canWrite(
	item: Record<string, unknown>,
	destination: string,
	policy: ExtractionOptions['overwrite'],
) {
	if (policy === 'preserve-input') return !Object.hasOwn(item, destination)
	if (policy === 'fill-empty') {
		const current = item[destination]
		return current === null || !isDefined(current) || current === ''
	}
	return true
}

/**
 * Validates one item and merges enabled extraction outputs into a copy.
 * @param input - Incoming item.
 * @param options - Validated operation configuration.
 * @param index - Item index used in validation errors.
 * @returns Complete transformed item.
 */
function transformItem(input: unknown, options: ExtractionOptions, index: number) {
	const parsed = itemSchema.safeParse(input)
	if (!parsed.success) throw new Error(`Item ${index}: expected an object payload`)
	const item = parsed.data
	const source = item[options.inputField]
	if (source === undefined) {
		if (options.missingInput === 'error') throw new Error(`Item ${index}: missing source field`)
		return item
	}
	if (source === null && options.nullInput !== 'clear') {
		if (options.nullInput === 'error') throw new Error(`Item ${index}: null source field`)
		return item
	}

	const values = source === null ? null : extractValues(source, options, index)
	const output = { ...item }
	for (const [component, destination] of toEntries(options.outputs)) {
		if (!destination) continue
		const value = values?.[component] ?? null
		if (values !== null && value === null) {
			if (options.missingComponent === 'skip') continue
			if (options.missingComponent === 'error')
				throw new Error(`Item ${index}: missing component ${component}`)
		}
		if (canWrite(item, destination, options.overwrite)) output[destination] = value
	}
	return output
}

/**
 * Transforms one item or an array, preserving shape and order without mutating input.
 * @param payload - Resolved Flow payload.
 * @param options - Validated operation configuration.
 * @returns Complete transformed payload; invalid batches reject in full.
 */
export function transformPayload(payload: unknown, options: ExtractionOptions) {
	if (!isArray(payload)) return transformItem(payload, options, 0)
	return payload.map((item, index) => transformItem(item, options, index))
}
