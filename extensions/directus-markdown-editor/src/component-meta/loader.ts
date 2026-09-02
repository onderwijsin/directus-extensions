import { normalizeComponentMetadata, type ComponentMetadata } from './schema'

/**
 * Fetch and validate project component metadata from a configured public URL.
 * @param url Public metadata URL.
 * @param signal Optional cancellation signal.
 * @returns Validated component metadata.
 */
export async function loadComponentMetadata(
	url: string,
	signal?: AbortSignal,
): Promise<ComponentMetadata[]> {
	const response = await fetch(url, { signal })
	if (!response.ok) throw new Error(`Component metadata request failed (${response.status}).`)
	return normalizeComponentMetadata(await response.json())
}
