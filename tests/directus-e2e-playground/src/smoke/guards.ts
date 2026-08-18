import {
	hasKey,
	hasKeys,
	isArray,
	isAudioMimeType,
	isBoolean,
	isDefined,
	isDocumentMimeType,
	isFiniteNumber,
	isFunction,
	isImageMimeType,
	isInteger,
	isNumber,
	isNonBlankString,
	isNonEmptyString,
	isRecord,
	isString,
	isVideoMimeType,
} from '@onderwijsin/directus-extension-utils'

/**
 * Runs the primitive and MIME guard checks for one Directus event payload.
 * @param record - Event metadata narrowed to an object.
 * @returns The observed guard results.
 */
export const runGuardSmokeTest = (record: Record<string, unknown>) => ({
	array: isArray([]),
	audio: isAudioMimeType('audio/mpeg'),
	boolean: isBoolean(true),
	defined: isDefined('value'),
	document: isDocumentMimeType('application/json'),
	finite: isFiniteNumber(1),
	function: isFunction(() => undefined),
	hasKey: hasKey(record, 'collection'),
	hasKeys: hasKeys(record),
	image: isImageMimeType('image/png'),
	integer: isInteger(1),
	number: isNumber(1),
	nonBlank: isNonBlankString('value'),
	nonEmpty: isNonEmptyString('value'),
	record: isRecord(record),
	string: isString('value'),
	video: isVideoMimeType('video/mp4'),
})
