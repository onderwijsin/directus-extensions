import type { CollectionConfiguration } from '../src/shared/configuration/types'

import { describe, expect, it, vi } from 'vitest'

import { archiveLifecycle, discoverArchiveSettings } from '../src/sluggernaut-hook/mutation/archive'
import {
	hasRelevantPayloadField,
	readExistingItem,
	relevantFields,
	resolveSingleUpdateItemKey,
} from '../src/sluggernaut-hook/mutation/items'

const configuration: CollectionConfiguration = {
	slugs: [
		{
			field: 'public_slug',
			sort: 1,
			options: {
				sourceFields: ['headline_text', 'section_label'],
				locale: 'en',
				lowercase: true,
				updateOnSourceChange: true,
				automaticRedirects: false,
				includeUnmanagedRedirectsInPlanning: true,
				unmanagedRedirectConflictBehavior: 'override',
			},
		},
	],
	permalinks: [
		{
			field: 'public_route',
			sort: 2,
			options: {
				generateFromSlug: true,
				slugField: 'public_slug',
				updateOnSlugChange: true,
				validatePrefixOnManualInput: false,
				trailingSlash: false,
				enforceTrailingSlashOnManualInput: false,
				automaticRedirects: false,
				includeUnmanagedRedirectsInPlanning: true,
				unmanagedRedirectConflictBehavior: 'override',
			},
		},
	],
	warnings: [],
}

describe('Sluggernaut mutation adapters', () => {
	it('collects each required field once and distinguishes absent from falsy payload keys', () => {
		expect(relevantFields(configuration)).toEqual([
			'public_slug',
			'headline_text',
			'section_label',
			'public_route',
		])
		expect(hasRelevantPayloadField({ headline_text: null }, configuration)).toBe(true)
		expect(hasRelevantPayloadField({ public_route: '' }, configuration)).toBe(true)
		expect(hasRelevantPayloadField({ unrelated: false }, configuration)).toBe(false)
	})

	it('reads existing fields with schema, accountability, transaction, and deduplicated fields', async () => {
		const readOne = vi.fn().mockResolvedValue({ headline_text: 'Hello' })
		const ItemsService = vi.fn(function () {
			return { readOne }
		})
		const context = {
			getSchema: vi.fn().mockResolvedValue({ version: 1 }),
			services: { ItemsService },
		} as never
		const database = vi.fn()
		const eventContext = {
			schema: {},
			accountability: { user: 'u' },
			database,
		}

		await expect(
			readExistingItem(
				context,
				'editorial_entries',
				3,
				['headline_text', 'headline_text'],
				eventContext as never,
			),
		).resolves.toEqual({ headline_text: 'Hello' })
		expect(ItemsService).toHaveBeenCalledWith('editorial_entries', {
			schema: { version: 1 },
			accountability: { user: 'u' },
			knex: eventContext.database,
		})
		expect(readOne).toHaveBeenCalledWith(3, { fields: ['headline_text'] })
	})

	it('rejects unreadable existing items and unsupported update keys', async () => {
		const context = {
			getSchema: vi.fn().mockResolvedValue({}),
			services: {
				ItemsService: vi.fn(function () {
					return { readOne: vi.fn().mockResolvedValue(null) }
				}),
			},
		} as never
		await expect(
			readExistingItem(context, 'entries', 1, ['title'], {} as never),
		).rejects.toThrow('could not read')
		for (const value of [undefined, [], [1, 2], [true], [{}], [null], [1.5]]) {
			expect(() => resolveSingleUpdateItemKey(value)).toThrow()
		}
		expect(resolveSingleUpdateItemKey(['entry'])).toBe('entry')
		expect(resolveSingleUpdateItemKey([4])).toBe(4)
	})

	it('discovers archive metadata safely and detects only real transitions', async () => {
		const readOne = vi.fn().mockResolvedValue({
			meta: {
				archive_field: 'status',
				archive_value: 'archived',
				unarchive_value: 'published',
			},
		})
		const context = {
			getSchema: vi.fn().mockResolvedValue({}),
			services: {
				CollectionsService: vi.fn(function () {
					return { readOne }
				}),
			},
		} as never
		await expect(discoverArchiveSettings(context, 'entries')).resolves.toEqual(
			expect.objectContaining({ archive_field: 'status' }),
		)
		expect(readOne).toHaveBeenCalledWith('entries')
		const settings = {
			archive_field: 'status',
			archive_value: 0,
			unarchive_value: false,
		} as never
		expect(archiveLifecycle('published', 0, settings)).toBe('archive')
		expect(archiveLifecycle(0, false, settings)).toBe('unarchive')
		expect(archiveLifecycle(0, 0, settings)).toBeNull()
		expect(
			archiveLifecycle('published', 'published', { archive_field: 'status' } as never),
		).toBeNull()
	})

	it('returns null for incomplete archive metadata and propagates schema failures', async () => {
		const readOne = vi
			.fn()
			.mockResolvedValueOnce({ meta: null })
			.mockResolvedValueOnce({ meta: { archive_field: 42 } })
		const context = {
			getSchema: vi.fn().mockResolvedValue({}),
			services: {
				CollectionsService: vi.fn(function () {
					return { readOne }
				}),
			},
		} as never
		await expect(discoverArchiveSettings(context, 'entries')).resolves.toBeNull()
		await expect(discoverArchiveSettings(context, 'entries')).resolves.toBeNull()
		const failingContext = {
			getSchema: vi.fn().mockRejectedValue(new Error('schema failed')),
			services: { CollectionsService: vi.fn() },
		} as never
		await expect(discoverArchiveSettings(failingContext, 'entries')).rejects.toThrow(
			'schema failed',
		)
	})
})
