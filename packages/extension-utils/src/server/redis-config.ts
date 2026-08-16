import { isNonBlankString, isString } from '../shared/guards'

/**
 * Validates and trims a Redis connection URL.
 * @param redisUrl - Connection URL to validate.
 * @returns The trimmed connection URL.
 */
export const validateRedisUrl = (redisUrl: string): string => {
	if (!isString(redisUrl) || !isNonBlankString(redisUrl)) {
		throw new TypeError('Redis URL must not be empty')
	}
	return redisUrl.trim()
}

/**
 * Validates and trims a Redis namespace.
 * @param namespace - Namespace to validate.
 * @param errorName - Error label used when validation fails.
 * @returns The trimmed namespace.
 */
export const validateRedisNamespace = (
	namespace: string,
	errorName = 'Redis namespace',
): string => {
	if (!isString(namespace) || !isNonBlankString(namespace)) {
		throw new TypeError(`${errorName} must not be empty`)
	}
	return namespace.trim()
}
