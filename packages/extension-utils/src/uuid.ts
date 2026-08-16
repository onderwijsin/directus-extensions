import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'

/** Stable namespace used when callers do not provide one for deterministic IDs. */
export const UUID_NAMESPACE_URL = uuidv5.URL

/**
 * Generates a random UUID v4.
 * @returns A random UUID v4 string.
 */
export function generateUUID(): string {
	return uuidv4()
}

/**
 * Generates the same UUID v5 for the same input and namespace.
 * @param input - Stable input used to derive the UUID.
 * @param namespace - UUID namespace used for namespacing the input.
 * @returns A deterministic UUID v5 string.
 */
export function generateDeterministicUUID(
	input: string,
	namespace: string = UUID_NAMESPACE_URL,
): string {
	return uuidv5(input, namespace)
}
