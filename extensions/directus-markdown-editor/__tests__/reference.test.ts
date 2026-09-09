import { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'

import { normalizeComponentMetadata } from '../src/component-meta/schema'
import { createEditorExtensions } from '../src/editor/extensions'
import { searchReferences } from '../src/reference/api'
import { scanReferences } from '../src/reference/editor'
import {
	isReferenceSnapshotCurrent,
	isReferenceItemArchived,
	itemToReference,
	parseReferenceProps,
	resolveReferenceCollections,
} from '../src/reference/schema'

const fields = [
	{ field: 'key', type: 'integer', schema: { is_primary_key: true }, meta: null },
	{ field: 'title', type: 'string', schema: {}, meta: null },
	{ field: 'slug', type: 'string', schema: {}, meta: null },
	{ field: 'body', type: 'text', schema: {}, meta: null },
	{ field: 'archived', type: 'boolean', schema: {}, meta: null },
	{
		field: 'author',
		type: 'uuid',
		schema: { foreign_key_table: 'authors' },
		meta: { special: ['m2o'] },
	},
]

function resolvedConfig() {
	const result = resolveReferenceCollections(
		[
			{
				collection: 'articles',
				displayField: 'title',
				searchFields: ['title', 'slug', 'title'],
				dataFields: ['slug', 'slug'],
			},
		],
		() => fields,
	)
	const config = result.collections[0]
	if (!config) throw new Error('Expected valid reference configuration.')
	return config
}

describe('Reference configuration and snapshots', () => {
	it('discovers non-id primary keys and normalizes field lists', () => {
		const config = resolvedConfig()
		expect(config).toMatchObject({
			primaryKeyField: 'key',
			searchFields: ['title', 'slug'],
			dataFields: ['slug'],
		})
	})

	it('discovers archive metadata and keeps a collection usable when its archive field is missing', () => {
		const configured = resolveReferenceCollections(
			[{ collection: 'articles', displayField: 'title' }],
			() => fields,
			() => ({ meta: { archive_field: 'archived', archive_value: 'true' } }),
		)
		const archive = configured.collections[0]?.archive
		expect(archive).toEqual({ field: 'archived', value: 'true', fieldType: 'boolean' })
		if (!archive) throw new Error('Expected archive configuration.')
		expect(isReferenceItemArchived(true, archive)).toBe(true)
		expect(isReferenceItemArchived(false, archive)).toBe(false)

		const unresolved = resolveReferenceCollections(
			[{ collection: 'articles', displayField: 'title' }],
			() => fields,
			() => ({ meta: { archive_field: 'missing', archive_value: 'archived' } }),
		)
		expect(unresolved.collections).toHaveLength(1)
		expect(unresolved.collections[0]?.archive).toBeUndefined()
		expect(unresolved.errors.join(' ')).toContain('archive field that could not be resolved')
	})

	it.each([
		[[{ collection: 'articles', displayField: 'author.name' }], 'non-empty valid JSON'],
		[
			[{ collection: 'articles', displayField: 'title', searchFields: ['author'] }],
			'relational',
		],
		[[{ collection: 'articles', displayField: 'title', searchFields: ['key'] }], 'non-text'],
	])('rejects unsupported collection configuration', (input, message) => {
		const result = resolveReferenceCollections(input, () => fields)
		expect(result.collections).toHaveLength(0)
		expect(result.errors.join(' ')).toContain(message)
	})

	it('rejects duplicate collection entries without crashing other configuration', () => {
		const result = resolveReferenceCollections(
			[
				{ collection: 'articles', displayField: 'title' },
				{ collection: 'articles', displayField: 'title' },
			],
			() => fields,
		)
		expect(result.collections).toHaveLength(0)
		expect(result.errors[0]).toContain('more than once')
	})

	it('parses string and numeric IDs and compares JSON data structurally', () => {
		const base = {
			collection: 'articles',
			item: 7,
			label: 'Seven',
			data: { b: 2, a: { d: 4, c: 3 } },
		}
		expect(parseReferenceProps(base).success).toBe(true)
		expect(parseReferenceProps({ ...base, item: 'uuid' }).success).toBe(true)
		expect(parseReferenceProps({ ...base, data: undefined }).success).toBe(false)
		expect(
			isReferenceSnapshotCurrent(base, { ...base, data: { a: { c: 3, d: 4 }, b: 2 } }),
		).toBe(true)
	})

	it('creates only configured snapshot data and falls back to the source ID for an empty label', () => {
		expect(
			itemToReference(
				{ key: 12, title: '', slug: 'twelve', body: 'ignored' },
				resolvedConfig(),
			),
		).toEqual({
			collection: 'articles',
			item: 12,
			label: '12',
			data: { slug: 'twelve' },
		})
	})

	it('reserves Reference from generic component metadata', () => {
		expect(
			normalizeComponentMetadata([
				{ name: 'Reference', nodeType: 'inline' },
				{ name: 'Callout', nodeType: 'block' },
			]).map((component) => component.name),
		).toEqual(['Callout'])
	})

	it('preserves malformed Reference Markdown through the generic MDC boundary', () => {
		const editor = new Editor({
			content: 'Read :Reference{collection="articles" item="7"}.',
			contentType: 'markdown',
			extensions: createEditorExtensions(),
		})
		try {
			expect(editor.getMarkdown()).toContain(':Reference{collection="articles" item="7"}')
		} finally {
			editor.destroy()
		}
	})
})

describe('Reference API and integrity', () => {
	it('searches explicit fields, tolerates an inaccessible collection, and ranks exact labels first', async () => {
		const config = resolvedConfig()
		const second = { ...config, collection: 'private', order: 1 }
		const get = vi.fn((url: string) => {
			if (url.includes('/private?')) {
				const error = new Error('Forbidden')
				Reflect.set(error, 'response', { status: 403 })
				return Promise.reject(error)
			}
			return Promise.resolve({
				data: {
					data: [
						{ key: 1, title: 'A matching article', slug: 'match' },
						{ key: 2, title: 'Match', slug: 'exact' },
					],
				},
			})
		})
		const results = await searchReferences({ get }, [config, second], 'match')
		expect(results.map((entry) => entry.reference.item)).toEqual([2, 1])
		const url = String(get.mock.calls[0]?.[0])
		expect(url).toContain('fields=key%2Ctitle%2Cslug')
		expect(url).not.toContain('*')
		expect(url).toContain('limit=5')
	})

	it('requests archive state and excludes archived records from search', async () => {
		const config = {
			...resolvedConfig(),
			archive: { field: 'archived', value: 'true', fieldType: 'boolean' },
		}
		const get = vi.fn().mockResolvedValue({ data: { data: [] } })
		await searchReferences({ get }, [config], 'match')
		const url = new URL(String(get.mock.calls[0]?.[0]), 'https://directus.test')
		expect(url.searchParams.get('fields')).toContain('archived')
		expect(JSON.parse(url.searchParams.get('filter') ?? '')).toEqual({
			_and: [
				{ _or: [{ title: { _icontains: 'match' } }, { slug: { _icontains: 'match' } }] },
				{ archived: { _neq: 'true' } },
			],
		})
	})

	it('detects and synchronizes stale snapshots in one editor transaction while preserving presentation', async () => {
		const config = resolvedConfig()
		const markdown =
			':Reference{collection="articles" :item="7" label="Old" text="Custom" icon="school" :data="{\\"slug\\":\\"old\\"}"}'
		const editor = new Editor({
			content: markdown,
			contentType: 'markdown',
			extensions: createEditorExtensions(),
		})
		const api = {
			get: vi.fn().mockResolvedValue({
				data: { data: [{ key: 7, title: 'Current', slug: 'current' }] },
			}),
		}
		try {
			const detected = await scanReferences(editor, api, [config], 'detect')
			expect(detected.occurrences[0]?.state).toBe('outdated')
			const synchronized = await scanReferences(editor, api, [config], 'sync')
			expect(synchronized.synchronized).toBe(1)
			expect(editor.getMarkdown()).toContain('label="Current"')
			expect(editor.getMarkdown()).toContain('text="Custom"')
			expect(editor.getMarkdown()).toContain('icon="school"')
		} finally {
			editor.destroy()
		}
	})

	it.each(['snapshot', 'detect', 'sync'] as const)(
		'reports boolean archived sources in %s mode without changing their snapshots',
		async (mode) => {
			const config = {
				...resolvedConfig(),
				archive: { field: 'archived', value: 'true', fieldType: 'boolean' },
			}
			const editor = new Editor({
				content:
					':Reference{collection="articles" :item="7" label="Old" :data="{\\"slug\\":\\"old\\"}"}',
				contentType: 'markdown',
				extensions: createEditorExtensions(),
			})
			try {
				const result = await scanReferences(
					editor,
					{
						get: vi.fn().mockResolvedValue({
							data: { data: [{ key: 7, title: 'New', slug: 'new', archived: true }] },
						}),
					},
					[config],
					mode,
				)
				expect(result.occurrences[0]).toMatchObject({
					state: 'archived',
					sourceState: 'archived',
					snapshotState: mode === 'snapshot' ? 'unchecked' : 'outdated',
				})
				expect(result.synchronized).toBe(0)
				expect(editor.getMarkdown()).toContain('label="Old"')
			} finally {
				editor.destroy()
			}
		},
	)
})
