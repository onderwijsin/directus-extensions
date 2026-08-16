import type { PartialNested } from '@onderwijsin/directus-extension-utils'

import {
	classifyMimeType,
	fromEntries,
	uuid,
	getFileType,
	keys,
	toEntries,
} from '@onderwijsin/directus-extension-utils'

/**
 * Runs object, type, MIME, and UUID utility checks.
 * @param record - Event metadata used to build the object result.
 * @param retryAttempt - Retry result used in the object result.
 * @param asyncAttempt - Async attempt result used in logger fields.
 * @returns The observed value utility results.
 */
export const runValueSmokeTest = (
	record: Record<string, unknown>,
	retryAttempt: string | null,
	asyncAttempt: string | null,
) => {
	const object = { collection: record.collection ?? 'unknown', retry: retryAttempt }
	const entries = toEntries(object)
	const partial: PartialNested<{ nested: { enabled: boolean } }> = { nested: {} }

	return {
		object: { entries, keys: keys(object), rebuilt: fromEntries(entries) },
		types: { partial },
		loggerFields: {
			attempt: asyncAttempt,
			classification: classifyMimeType('application/json'),
			deterministicUuid: uuid('e2e-playground'),
			uuid: uuid(),
			fileType: getFileType('text/plain'),
		},
	}
}
