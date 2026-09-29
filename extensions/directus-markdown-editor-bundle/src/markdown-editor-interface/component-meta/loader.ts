import { ofetch } from 'ofetch'

import { normalizeComponentMetadata, type ComponentMetadata } from './schema'

export type ComponentMetadataSource =
	| { type: 'static'; value: unknown }
	| { type: 'url'; url?: string }

/**
 * Load and validate project component metadata from the selected source.
 * @param source Static metadata or a public metadata URL.
 * @param signal Optional cancellation signal.
 * @returns Validated component metadata.
 */
export async function loadComponentMetadata(
	source: ComponentMetadataSource,
	signal?: AbortSignal,
): Promise<ComponentMetadata[]> {
	if (source.type === 'static') return normalizeComponentMetadata(source.value)
	if (!source.url) return normalizeComponentMetadata([])
	return normalizeComponentMetadata(await ofetch<unknown>(source.url, { signal }))
}
