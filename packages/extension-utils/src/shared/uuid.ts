import { v4 as generateV4, v5 as generateV5, v7 as generateV7 } from 'uuid'

/** Stable namespace used when callers do not provide one for deterministic IDs. */
export const UUID_NAMESPACE_URL = generateV5.URL

/**
 * Generates a UUID v7, or a deterministic UUID v5 when an input is supplied.
 * @param input - Optional stable input used to derive a deterministic UUID v5.
 * @param namespace - UUID namespace used for deterministic generation.
 * @returns A UUID v7 or deterministic UUID v5 string.
 */
export function uuid(): string
export function uuid(input: string, namespace?: string): string
export function uuid(input?: string, namespace: string = UUID_NAMESPACE_URL): string {
	return input === undefined ? generateV7() : generateV5(input, namespace)
}

/**
 * Generates a random UUID v4.
 * @returns A random UUID v4 string.
 */
export function uuidv4(): string {
	return generateV4()
}
