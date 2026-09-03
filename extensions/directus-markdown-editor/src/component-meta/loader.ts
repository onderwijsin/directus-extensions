import { ofetch } from 'ofetch'

import { normalizeComponentMetadata, type ComponentMetadata } from './schema'

/** Temporary metadata fixture for exercising the editor before a Nuxt endpoint is available. */
export const mockComponentMetadata: ComponentMetadata[] = [
	{
		name: 'Hero',
		label: 'Hero',
		description: 'A prominent introduction block.',
		props: { theme: { type: 'string', values: ['light', 'dark'], default: 'light' } },
		slots: ['title', 'description'],
	},
	{
		name: 'Callout',
		label: 'Callout',
		description: 'Highlighted supporting content.',
		props: {
			tone: { type: 'string', values: ['info', 'warning'], default: 'warning' },
			compact: { type: 'boolean', default: false },
		},
		slots: ['default'],
	},
	{
		name: 'Icon',
		label: 'Icon',
		description: 'An inline status icon.',
		props: { name: { type: 'string', default: 'check' } },
		slots: [],
	},
]

/**
 * Fetch and validate project component metadata from a configured public URL.
 * @param url Public metadata URL.
 * @param signal Optional cancellation signal.
 * @param useMock Return the temporary local fixture instead of making a request.
 * @returns Validated component metadata.
 */
export async function loadComponentMetadata(
	url: string | undefined,
	signal?: AbortSignal,
	useMock = false,
): Promise<ComponentMetadata[]> {
	if (useMock) return mockComponentMetadata
	if (!url) return []
	return normalizeComponentMetadata(await ofetch<unknown>(url, { signal }))
}
