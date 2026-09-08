import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { loadComponentMetadata, mockComponentMetadata } from '../src/component-meta/loader'
import { normalizeComponentMetadata } from '../src/component-meta/schema'
import { MdcBlock, MdcInline, MdcSlot } from '../src/markdown'
import { parseMdcAttributes, serializeMdcAttributes } from '../src/markdown/attributes'

function manager() {
	return new MarkdownManager({ extensions: [StarterKit, MdcBlock, MdcInline, MdcSlot] })
}

describe('generic MDC Markdown boundary', () => {
	it('round-trips ordinary Markdown and a generic block', () => {
		const input = 'A **portable** paragraph.\n\n::callout{tone="warning"}\nHello *world*.\n::'
		const markdown = manager()
		const json = manager().parse(input)
		const output = markdown.serialize(json)

		expect(json.content?.[1]).toMatchObject({
			type: 'mdcBlock',
			attrs: { name: 'callout', props: { tone: 'warning' } },
		})
		expect(output).toContain('::callout{tone="warning"}')
		expect(markdown.serialize(markdown.parse(output))).toBe(output)
	})

	it('supports inline MDC without a project-specific extension', () => {
		const markdown = manager()
		const json = markdown.parse('Status :icon{name="check"} confirmed.')

		expect(json).toMatchObject({
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'Status ' },
						{ type: 'mdcInline', attrs: { name: 'icon', props: { name: 'check' } } },
						{ type: 'text', text: ' confirmed.' },
					],
				},
			],
		})
		expect(markdown.serialize(json)).toBe('Status :icon{name="check"} confirmed.')
	})

	it('round-trips escaped strings and typed dynamic properties', () => {
		const properties = {
			title: 'He said "hello" beside a \\ and a } brace.\nThen left.',
			controlCharacter: 'before\u0001after',
			required: true,
			disabled: false,
			count: 3,
			items: ['one', 'two'],
		}
		const serialized = serializeMdcAttributes(properties)
		const attributeSource = serialized.slice(1, -1)

		expect(parseMdcAttributes(attributeSource)).toEqual(properties)

		const markdown = manager()
		const source = `::callout${serialized}\nContent\n::`
		const json = markdown.parse(source)
		expect(json.content?.[0]?.attrs?.props).toEqual(properties)
		expect(markdown.serialize(markdown.parse(markdown.serialize(json)))).toBe(
			markdown.serialize(json),
		)
	})

	it('keeps unknown component names as generic data', () => {
		const markdown = manager()
		const json = markdown.parse('::future-component\ncontent\n::')

		expect(json.content?.[0]).toMatchObject({
			type: 'mdcBlock',
			attrs: { name: 'future-component' },
		})
	})

	it('round-trips nested generic blocks', () => {
		const markdown = manager()
		const input = '::hero\n:::callout{tone="warning"}\nNested **content**.\n:::\n::'
		const output = markdown.serialize(markdown.parse(input))

		expect(output).toContain(':::callout{tone="warning"}')
		expect(markdown.serialize(markdown.parse(output))).toBe(output)
	})

	it('represents named slots as editable document structure', () => {
		const markdown = manager()
		const input = '::hero\n#title\nBecome a **teacher**\n\n#description\nSupporting copy.\n::'
		const json = markdown.parse(input)
		const output = markdown.serialize(json)

		expect(json.content?.[0]).toMatchObject({
			type: 'mdcBlock',
			content: [
				{ type: 'mdcSlot', attrs: { name: 'title' } },
				{ type: 'mdcSlot', attrs: { name: 'description' } },
			],
		})
		expect(output).toContain('#title')
		expect(markdown.serialize(markdown.parse(output))).toBe(output)
	})

	it('supports the MDC YAML props form', () => {
		const markdown = manager()
		const input =
			'::icon-card\n---\ntitle: Nuxt Architecture.\nfeatured: true\nitems:\n  - one\n  - two\n---\n::'
		const json = markdown.parse(input)
		const output = markdown.serialize(json)

		expect(json.content?.[0]).toMatchObject({
			type: 'mdcBlock',
			attrs: {
				name: 'icon-card',
				propsFormat: 'yaml',
				props: { title: 'Nuxt Architecture.', featured: true, items: ['one', 'two'] },
			},
		})
		expect(output).toContain('featured: true')
		expect(markdown.serialize(markdown.parse(output))).toBe(output)
	})

	it('preserves empty and unknown blocks without project metadata', () => {
		const markdown = manager()
		const input = '::future-component{mode="opaque"}\n::\n\n::empty\n::'
		const output = markdown.serialize(markdown.parse(input))

		expect(output).toContain('::future-component{mode="opaque"}')
		expect(output).toContain('::empty')
	})
})

describe('component metadata boundary', () => {
	it('loads the temporary fixture without a URL request', async () => {
		await expect(loadComponentMetadata(undefined, undefined, true)).resolves.toEqual(
			mockComponentMetadata,
		)
	})

	it('normalizes component metadata for the editor menu', () => {
		const components = normalizeComponentMetadata({
			components: [
				{
					name: 'Callout',
					label: 'Callout',
					props: [{ name: 'tone', type: 'string', values: ['info', 'warning'] }],
					slots: [{ name: 'default' }],
				},
			],
		})

		expect(components).toEqual([
			{
				name: 'Callout',
				label: 'Callout',
				props: { tone: { name: 'tone', type: 'string', values: ['info', 'warning'] } },
				slots: ['default'],
			},
		])
	})

	it('rejects malformed metadata', () => {
		expect(() =>
			normalizeComponentMetadata({ components: [{ label: 'Missing name' }] }),
		).toThrow('unsupported shape')
	})
})
