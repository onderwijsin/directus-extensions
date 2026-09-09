import type { JSONContent, MarkdownToken } from '@tiptap/core'
import type { MarkdownParseHelpers, MarkdownRendererHelpers } from '@tiptap/core'

import { attemptSync, isRecord, isString } from '@onderwijsin/directus-extension-utils'
import { Node } from '@tiptap/core'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import MdcBlockView from '../components/MdcBlockView.vue'
import MdcInlineView from '../components/MdcInlineView.vue'
import MdcSlotView from '../components/MdcSlotView.vue'
import { parseCodeBlockToken } from '../editor/code-block'
import { createVueNodeView } from '../editor/node-view'
import { parseMdcAttributes, readMdcAttributeBlock, serializeMdcAttributes } from './attributes'

// The callbacks in a Tiptap extension config are documented by the public Tiptap types.
// Their signatures are intentionally kept inline with that config so the extension remains portable.

type MdcToken = MarkdownToken & {
	name?: string
	depth?: number
	attributes?: Record<string, unknown>
	propsFormat?: 'inline' | 'yaml'
}

type MdcNode = JSONContent & {
	attrs?: {
		name?: unknown
		props?: Record<string, unknown>
		depth?: unknown
		propsFormat?: unknown
	}
	content?: JSONContent[]
}

/**
 * Parse an MDC YAML property block when its root value is an object.
 * @param source YAML source between MDC frontmatter delimiters.
 * @returns Parsed component properties, or undefined for invalid/non-object YAML.
 */
function parseYamlProps(source: string): Record<string, unknown> | undefined {
	const result = attemptSync(() => parseYaml(source) as unknown)
	if (result.error !== null || !isRecord(result.data)) return undefined
	return result.data
}

/**
 * Convert a tokenized MDC block, including the code-collapse convention, to editor content.
 * @param token Token produced by the MDC block tokenizer.
 * @param helpers Tiptap Markdown parsing helpers.
 * @returns The corresponding editor node.
 */
function parseBlockToken(token: MdcToken, helpers: MarkdownParseHelpers) {
	if (token.name === 'code-collapse') {
		const codeToken = token.tokens?.find((child) => child.type === 'code')
		if (codeToken) return parseCodeBlockToken(codeToken, helpers, true)
	}
	return helpers.createNode(
		'mdcBlock',
		{
			name: token.name ?? 'unknown',
			props: token.attributes ?? {},
			depth: token.depth ?? 2,
			propsFormat: token.propsFormat ?? 'inline',
		},
		helpers.parseChildren(token.tokens ?? []),
	)
}

/**
 * Locate the closing delimiter for a block at the current nesting depth.
 * @param source Markdown following the block opening line.
 * @param depth Required delimiter length.
 * @returns Source offset of the closing line, or -1 when no closing line exists.
 */
function findClosingLine(source: string, depth: number): number {
	const lines = source.split('\n')
	let offset = 0
	for (const line of lines) {
		if (new RegExp(`^:{${depth}}\\s*$`, 'u').test(line)) return offset
		offset += line.length + 1
	}
	return -1
}

/**
 * Convert a named slot token to a non-empty block node.
 * @param token Token produced by the named-slot tokenizer.
 * @param helpers Tiptap Markdown parsing helpers.
 * @returns A slot node containing at least one editable paragraph.
 */
function parseSlotToken(token: MarkdownToken, helpers: MarkdownParseHelpers) {
	const content = helpers.parseChildren(token.tokens ?? [])
	return helpers.createNode(
		'mdcSlot',
		{ name: (token as MarkdownToken & { name?: string }).name ?? 'default' },
		content.length > 0 ? content : [{ type: 'paragraph' }],
	)
}

/** Generic named MDC slot support. Slot markers remain real document structure. */
export const MdcSlot = Node.create({
	name: 'mdcSlot',
	group: 'block',
	content: 'block+',
	defining: true,
	isolating: true,
	addNodeView: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => createVueNodeView(MdcSlotView),

	addAttributes: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => ({ name: { default: 'default' } }),

	parseHTML: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => [{ tag: 'div[data-mdc-slot]' }],

	renderHTML: /**
	 * Editor callback.
	 * @param { node, HTMLAttributes } Parameter value.
	 * @returns Callback result.
	 */ ({ node, HTMLAttributes }) => [
		'div',
		{ ...HTMLAttributes, 'data-mdc-slot': node.attrs.name },
		0,
	],
	markdownTokenName: 'mdcSlot',

	parseMarkdown: /**
	 * Editor callback.
	 * @param token Parameter value.
	 * @param helpers Parameter value.
	 * @returns Callback result.
	 */ (token, helpers) => parseSlotToken(token, helpers),
	markdownTokenizer: {
		name: 'mdcSlot',
		level: 'block' as const,

		start: /**
		 * Editor callback.
		 * @param source Parameter value.
		 * @returns Callback result.
		 */ (source: string) => source.search(/^#[\w-]+\s*$/mu),

		tokenize: /**
		 * Editor callback.
		 * @param source Parameter value.
		 * @param _tokens Parameter value.
		 * @param lexer Parameter value.
		 * @returns Callback result.
		 */ (source: string, _tokens: MarkdownToken[], lexer) => {
			const opening = /^#([\w-]+)\s*\n/u.exec(source)
			if (!opening?.[1]) return undefined
			const remainder = source.slice(opening[0].length)
			const nextBoundary = /^(?:#[\w-]+|:{2,})\s*$/mu.exec(remainder)
			const contentEnd = nextBoundary?.index ?? remainder.length
			const contentSource = remainder.slice(0, contentEnd)
			const raw = source.slice(0, opening[0].length + contentEnd)
			return {
				type: 'mdcSlot',
				raw,
				name: opening[1],
				tokens: lexer.blockTokens(contentSource),
			}
		},
	},

	renderMarkdown: /**
	 * Editor callback.
	 * @param node Parameter value.
	 * @param helpers Parameter value.
	 * @returns Callback result.
	 */ (node: MdcNode, helpers: MarkdownRendererHelpers) =>
		`#${isString(node.attrs?.name) ? node.attrs.name : 'default'}\n${helpers.renderChildren(node.content ?? [])}\n`,
})

/** Generic block MDC support. Component names are data, not extensions. */
export const MdcBlock = Node.create({
	name: 'mdcBlock',
	group: 'block',
	content: 'block*',
	defining: true,
	isolating: true,
	allowGapCursor: false,
	addNodeView: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => createVueNodeView(MdcBlockView),

	addAttributes: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => ({
		name: { default: 'unknown' },
		props: { default: {} },
		depth: { default: 2 },
		propsFormat: { default: 'inline' },
	}),

	parseHTML: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => [{ tag: 'div[data-mdc-block]' }],

	renderHTML: /**
	 * Editor callback.
	 * @param { node, HTMLAttributes } Parameter value.
	 * @returns Callback result.
	 */ ({ node, HTMLAttributes }) => [
		'div',
		{ ...HTMLAttributes, 'data-mdc-block': node.attrs.name },
		0,
	],
	markdownTokenName: 'mdcBlock',

	parseMarkdown: /**
	 * Editor callback.
	 * @param token Parameter value.
	 * @param helpers Parameter value.
	 * @returns Callback result.
	 */ (token, helpers) => parseBlockToken(token as MdcToken, helpers),
	markdownTokenizer: {
		name: 'mdcBlock',
		level: 'block' as const,

		start: /**
		 * Editor callback.
		 * @param source Parameter value.
		 * @returns Callback result.
		 */ (source: string) => source.search(/^::+[\w-]+/mu),

		tokenize: /**
		 * Editor callback.
		 * @param source Parameter value.
		 * @param _tokens Parameter value.
		 * @param lexer Parameter value.
		 * @returns Callback result.
		 */ (source: string, _tokens: MarkdownToken[], lexer) => {
			const opening = /^(::+)([\w-]+)/u.exec(source)
			if (!opening) return undefined
			const delimiter = opening[1]
			if (!delimiter) return undefined
			const remainder = source.slice(opening[0].length)
			const attributeBlock = readMdcAttributeBlock(remainder)
			const lineEnding = /^[\t ]*\n/u.exec(remainder.slice(attributeBlock?.length ?? 0))
			if (!lineEnding) return undefined
			const openingLength =
				opening[0].length + (attributeBlock?.length ?? 0) + lineEnding[0].length
			const depth = delimiter.length
			const closingEnd = findClosingLine(source.slice(openingLength), depth)
			if (closingEnd < 0) return undefined
			const inner = source.slice(openingLength, openingLength + closingEnd)
			const closingLine = /^:{2,}\s*(?:\n|$)/u.exec(
				source.slice(openingLength + closingEnd),
			)?.[0]
			if (!closingLine) return undefined
			const raw = source.slice(0, openingLength + closingEnd + closingLine.length)
			const yamlBlock = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(inner)
			const yamlProps = yamlBlock ? parseYamlProps(yamlBlock[1] ?? '') : undefined
			if (yamlBlock && !yamlProps) return undefined
			const contentSource = yamlBlock ? inner.slice(yamlBlock[0].length) : inner
			return {
				type: 'mdcBlock',
				raw,
				name: opening[2],
				depth,
				attributes: yamlProps ?? parseMdcAttributes(attributeBlock?.source),
				propsFormat: yamlProps ? 'yaml' : 'inline',
				tokens: lexer.blockTokens(contentSource),
			}
		},
	},

	renderMarkdown: /**
	 * Editor callback.
	 * @param node Parameter value.
	 * @param helpers Parameter value.
	 * @returns Callback result.
	 */ (node: MdcNode, helpers: MarkdownRendererHelpers) => {
		const name = isString(node.attrs?.name) ? node.attrs.name : 'unknown'
		const depth = Math.max(2, Number(node.attrs?.depth ?? 2))
		const delimiter = ':'.repeat(depth)
		const props = node.attrs?.props ?? {}
		const propsFormat = node.attrs?.propsFormat === 'yaml' ? 'yaml' : 'inline'
		const inlineProps = propsFormat === 'inline' ? serializeMdcAttributes(props) : ''
		const yamlProps = propsFormat === 'yaml' ? `\n---\n${stringifyYaml(props).trim()}\n---` : ''
		const content = node.content?.length ? `\n${helpers.renderChildren(node.content)}\n` : '\n'
		return `${delimiter}${name}${inlineProps}${yamlProps}${content}${delimiter}`
	},
})

/** Generic inline MDC support for self-closing components. */
export const MdcInline = Node.create({
	name: 'mdcInline',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,
	addNodeView: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => createVueNodeView(MdcInlineView),

	addAttributes: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => ({ name: { default: 'unknown' }, props: { default: {} } }),

	parseHTML: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => [{ tag: 'span[data-mdc-inline]' }],

	renderHTML: /**
	 * Editor callback.
	 * @param { node, HTMLAttributes } Parameter value.
	 * @returns Callback result.
	 */ ({ node, HTMLAttributes }) => [
		'span',
		{ ...HTMLAttributes, 'data-mdc-inline': node.attrs.name },
		`:${isString(node.attrs.name) ? node.attrs.name : 'unknown'}`,
	],
	markdownTokenName: 'mdcInline',

	parseMarkdown: /**
	 * Editor callback.
	 * @param token Parameter value.
	 * @returns Callback result.
	 */ (token) => ({
		type: 'mdcInline',
		attrs: {
			name: (token as MdcToken).name ?? 'unknown',
			props: (token as MdcToken).attributes ?? {},
		},
	}),
	markdownTokenizer: {
		name: 'mdcInline',
		level: 'inline' as const,
		start: ':',

		tokenize: /**
		 * Editor callback.
		 * @param source Parameter value.
		 * @returns Callback result.
		 */ (source: string) => {
			const match = /^:([\w-]+)/u.exec(source)
			if (!match) return undefined
			const attributeBlock = readMdcAttributeBlock(source.slice(match[0].length))
			return {
				type: 'mdcInline',
				raw: source.slice(0, match[0].length + (attributeBlock?.length ?? 0)),
				name: match[1],
				attributes: parseMdcAttributes(attributeBlock?.source),
			}
		},
	},

	renderMarkdown: /**
	 * Editor callback.
	 * @param node Parameter value.
	 * @returns Callback result.
	 */ (node: MdcNode) => {
		const name = isString(node.attrs?.name) ? node.attrs.name : 'unknown'
		return `:${name}${serializeMdcAttributes(node.attrs?.props) || '{}'}`
	},
})
