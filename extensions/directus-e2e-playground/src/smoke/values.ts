import type { Geometry, PartialNested } from '@onderwijsin/directus-extension-utils'

import {
	classifyMimeType,
	fromEntries,
	generateDeterministicUUID,
	generateUUID,
	getFileType,
	keys,
	toEntries,
} from '@onderwijsin/directus-extension-utils'

/**
 * Runs object, type, MIME, and UUID utility checks.
 * @param record - Event metadata used to build the object result.
 * @param attempt - Retry result used in the object result.
 * @returns The observed value utility results.
 */
export const runValueSmokeTest = (record: Record<string, unknown>, attempt: string | null) => {
	const object = { collection: record.collection ?? 'unknown', retry: attempt }
	const entries = toEntries(object)
	const point: Geometry = { type: 'Point', coordinates: [4.9, 52.3] }
	const partial: PartialNested<{ nested: { enabled: boolean } }> = { nested: {} }

	return {
		object: { entries, keys: keys(object), rebuilt: fromEntries(entries) },
		types: { point, partial },
		loggerFields: {
			attempt,
			classification: classifyMimeType('application/json'),
			deterministicUuid: generateDeterministicUUID('e2e-playground'),
			uuid: generateUUID(),
			fileType: getFileType('text/plain'),
		},
	}
}
