import type { CollectionConfiguration } from '../src/shared/configuration/types'

import { describe, expect, it, vi } from 'vitest'

import { processCanonicalRedirect } from '../src/sluggernaut-hook/mutation/redirects/canonical-redirects'
import { processArchiveLifecycle } from '../src/sluggernaut-hook/mutation/redirects/lifecycle-redirects'

const configuration: CollectionConfiguration = {
	slugs: [],
	permalinks: [
		{
			field: 'route',
			sort: 1,
			options: {
				generateFromSlug: false,
				updateOnSlugChange: false,
				validatePrefixOnManualInput: false,
				trailingSlash: false,
				enforceTrailingSlashOnManualInput: false,
				automaticRedirects: true,
				includeUnmanagedRedirectsInPlanning: true,
				unmanagedRedirectConflictBehavior: 'override',
			},
		},
	],
	warnings: [],
}

const enabled = {
	SLUGGERNAUT_REDIRECTS_ENABLED: true,
	SLUGGERNAUT_REDIRECTS_COLLECTION: 'redirect_records',
}
const context = { logger: { warn: vi.fn() } }

describe('Sluggernaut redirect processing adapters', () => {
	it('does nothing when redirects are disabled, source is absent, or canonical is stable', async () => {
		const input = {
			context,
			options: { ...enabled, SLUGGERNAUT_REDIRECTS_ENABLED: false },
			collection: 'entries',
			key: 1,
			existingItem: { route: '/old' },
			nextItem: { route: '/new' },
			configuration,
			database: vi.fn(),
		}
		await expect(processCanonicalRedirect(input as never)).resolves.toBeUndefined()
		await expect(
			processCanonicalRedirect({
				...input,
				options: enabled,
				existingItem: {},
				nextItem: { route: '/new' },
			} as never),
		).resolves.toBeUndefined()
		await expect(
			processCanonicalRedirect({
				...input,
				options: enabled,
				existingItem: { route: '/same' },
				nextItem: { route: '/same' },
			} as never),
		).resolves.toBeUndefined()
	})

	it('keeps lifecycle work disabled and never creates canonical operations', async () => {
		await expect(
			processArchiveLifecycle({
				context,
				options: { ...enabled, SLUGGERNAUT_REDIRECTS_ENABLED: false } as never,
				collection: 'entries',
				key: 1,
				lifecycle: 'archive',
				database: vi.fn(),
			} as never),
		).resolves.toBeUndefined()
	})
})
