import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { normalizeComponentMetadata } from '../src/markdown-editor-interface/component-meta/schema'
import { MdcBlock, MdcInline, MdcSlot } from '../src/markdown-editor-interface/markdown'
import {
	parseMdcAttributes,
	serializeMdcAttributes,
} from '../src/markdown-editor-interface/markdown/attributes'

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

	it('delimits an empty inline component from adjacent identifier text', () => {
		const markdown = manager()
		const document = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'mdcInline', attrs: { name: 'Icon', props: {} } },
						{ type: 'text', text: 'a' },
					],
				},
			],
		}
		const output = markdown.serialize(document)

		expect(output).toBe(':Icon{}a')
		expect(markdown.parse(output)).toMatchObject(document)
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
	it('normalizes component metadata for the editor menu', () => {
		const components = normalizeComponentMetadata({
			components: [
				{
					name: 'Callout',
					label: 'Callout',
					nodeType: 'block',
					props: [{ name: 'tone', type: 'string', values: ['info', 'warning'] }],
					slots: [{ name: 'default' }],
				},
			],
		})

		expect(components).toEqual([
			{
				name: 'Callout',
				label: 'Callout',
				nodeType: 'block',
				props: { tone: { name: 'tone', type: 'string', values: ['info', 'warning'] } },
				slots: ['default'],
			},
		])
	})

	it('preserves standard JSDoc deprecation tags on properties', () => {
		const component = normalizeComponentMetadata([
			{
				name: 'Card',
				nodeType: 'block',
				props: {
					oldProp: {
						tags: [{ name: 'deprecated', text: 'Use newProp instead.' }],
					},
				},
			},
		])[0]

		expect(component?.props.oldProp?.tags).toEqual([
			{ name: 'deprecated', text: 'Use newProp instead.' },
		])
	})

	it('preserves standard JSDoc deprecation tags on components', () => {
		const component = normalizeComponentMetadata([
			{
				name: 'OldCard',
				nodeType: 'block',
				tags: [{ name: 'deprecated', text: 'Use Card instead.' }],
			},
		])[0]

		expect(component?.tags).toEqual([{ name: 'deprecated', text: 'Use Card instead.' }])
	})

	it('rejects malformed metadata', () => {
		expect(() =>
			normalizeComponentMetadata({ components: [{ label: 'Missing name' }] }),
		).toThrow('unsupported shape')
	})

	it.each(['inline', 'block'] as const)('accepts and preserves %s node metadata', (nodeType) => {
		expect(normalizeComponentMetadata([{ name: 'Component', nodeType }])[0]?.nodeType).toBe(
			nodeType,
		)
	})

	it.each([{ name: 'Missing node type' }, { name: 'Unsupported node type', nodeType: 'flow' }])(
		'rejects $name metadata',
		(component) => {
			expect(() => normalizeComponentMetadata([component])).toThrow('unsupported shape')
		},
	)
})
