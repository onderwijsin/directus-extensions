import type { JSONContent, MarkdownToken } from '@tiptap/core'
import type { MarkdownParseHelpers, MarkdownRendererHelpers } from '@tiptap/core'

import { Node } from '@tiptap/core'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { parseMdcAttributes, serializeMdcAttributes } from './attributes'

// The callbacks in a Tiptap extension config are documented by the public Tiptap types.
// Their signatures are intentionally kept inline with that config so the extension remains portable.
// oxlint-disable jsdoc-js/require-jsdoc

type MdcToken = MarkdownToken & {
	name?: string
	depth?: number
	attributes?: Record<string, string | boolean>
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
 * Parse the YAML props form accepted inside MDC blocks.
 * @param source YAML document.
 * @returns Object props, or `undefined` for invalid/non-object YAML.
 */
function parseYamlProps(source: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = parseYaml(source)
		if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
		return Object.fromEntries(Object.entries(value))
	} catch {
		return undefined
	}
}

/**
 * Convert a parsed MDC token into a generic block node.
 * @param token Parsed MDC token.
 * @param helpers Tiptap Markdown parse helpers.
 * @returns Generic MDC block JSON.
 */
function parseBlockToken(token: MdcToken, helpers: MarkdownParseHelpers) {
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
 * Find the matching same-depth MDC closing delimiter.
 * @param source MDC body source.
 * @param depth Opening delimiter depth.
 * @returns Offset and length of the closing line, or `-1`.
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
 * Convert a named MDC slot token into an editable block node.
 * @param token Parsed slot token.
 * @param helpers Tiptap Markdown parse helpers.
 * @returns Generic MDC slot JSON.
 */
function parseSlotToken(token: MarkdownToken, helpers: MarkdownParseHelpers) {
	return helpers.createNode(
		'mdcSlot',
		{ name: (token as MarkdownToken & { name?: string }).name ?? 'default' },
		helpers.parseChildren(token.tokens ?? []),
	)
}

/** Generic named MDC slot support. Slot markers remain real document structure. */
export const MdcSlot = Node.create({
	name: 'mdcSlot',
	group: 'block',
	content: 'block*',
	defining: true,
	addAttributes: () => ({ name: { default: 'default' } }),
	parseHTML: () => [{ tag: 'div[data-mdc-slot]' }],
	renderHTML: ({ node, HTMLAttributes }) => [
		'div',
		{ ...HTMLAttributes, 'data-mdc-slot': node.attrs.name },
		0,
	],
	markdownTokenName: 'mdcSlot',
	parseMarkdown: (token, helpers) => parseSlotToken(token, helpers),
	markdownTokenizer: {
		name: 'mdcSlot',
		level: 'block' as const,
		start: (source: string) => source.search(/^#[\w-]+\s*$/mu),
		tokenize: (source: string, _tokens: MarkdownToken[], lexer) => {
			const opening = /^#([\w-]+)\s*\n/u.exec(source)
			if (!opening?.[1]) return undefined
			const remainder = source.slice(opening[0].length)
			const nextSlot = /^#[\w-]+\s*$/mu.exec(remainder)
			const contentEnd = nextSlot?.index ?? remainder.length
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
	renderMarkdown: (node: MdcNode, helpers: MarkdownRendererHelpers) =>
		`#${typeof node.attrs?.name === 'string' ? node.attrs.name : 'default'}\n${helpers.renderChildren(node.content ?? [])}`,
})

/** Generic block MDC support. Component names are data, not extensions. */
export const MdcBlock = Node.create({
	name: 'mdcBlock',
	group: 'block',
	content: 'block*',
	defining: true,
	isolating: true,
	addAttributes: () => ({
		name: { default: 'unknown' },
		props: { default: {} },
		depth: { default: 2 },
		propsFormat: { default: 'inline' },
	}),
	parseHTML: () => [{ tag: 'div[data-mdc-block]' }],
	renderHTML: ({ node, HTMLAttributes }) => [
		'div',
		{ ...HTMLAttributes, 'data-mdc-block': node.attrs.name },
		0,
	],
	markdownTokenName: 'mdcBlock',
	parseMarkdown: (token, helpers) => parseBlockToken(token as MdcToken, helpers),
	markdownTokenizer: {
		name: 'mdcBlock',
		level: 'block' as const,
		start: (source: string) => source.search(/^::+[\w-]+/mu),
		tokenize: (source: string, _tokens: MarkdownToken[], lexer) => {
			const opening = /^(::+)([\w-]+)(?:\{([^\n}]*)\})?\s*\n/u.exec(source)
			if (!opening) return undefined
			const delimiter = opening[1]
			if (!delimiter) return undefined
			const depth = delimiter.length
			const closingEnd = findClosingLine(source.slice(opening[0].length), depth)
			if (closingEnd < 0) return undefined
			const inner = source.slice(opening[0].length, opening[0].length + closingEnd)
			const closingLine = /^:{2,}\s*(?:\n|$)/u.exec(
				source.slice(opening[0].length + closingEnd),
			)?.[0]
			if (!closingLine) return undefined
			const raw = source.slice(0, opening[0].length + closingEnd + closingLine.length)
			const yamlBlock = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(inner)
			const yamlProps = yamlBlock ? parseYamlProps(yamlBlock[1] ?? '') : undefined
			if (yamlBlock && !yamlProps) return undefined
			const contentSource = yamlBlock ? inner.slice(yamlBlock[0].length) : inner
			return {
				type: 'mdcBlock',
				raw,
				name: opening[2],
				depth,
				attributes: yamlProps ?? parseMdcAttributes(opening[3]),
				propsFormat: yamlProps ? 'yaml' : 'inline',
				tokens: lexer.blockTokens(contentSource),
			}
		},
	},
	renderMarkdown: (node: MdcNode, helpers: MarkdownRendererHelpers) => {
		const name = typeof node.attrs?.name === 'string' ? node.attrs.name : 'unknown'
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
	addAttributes: () => ({ name: { default: 'unknown' }, props: { default: {} } }),
	parseHTML: () => [{ tag: 'span[data-mdc-inline]' }],
	renderHTML: ({ node, HTMLAttributes }) => [
		'span',
		{ ...HTMLAttributes, 'data-mdc-inline': node.attrs.name },
		`:${typeof node.attrs.name === 'string' ? node.attrs.name : 'unknown'}`,
	],
	markdownTokenName: 'mdcInline',
	parseMarkdown: (token) => ({
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
		tokenize: (source: string) => {
			const match = /^:([\w-]+)(?:\{([^}]*)\})?/u.exec(source)
			if (!match) return undefined
			return {
				type: 'mdcInline',
				raw: match[0],
				name: match[1],
				attributes: parseMdcAttributes(match[2]),
			}
		},
	},
	renderMarkdown: (node: MdcNode) => {
		const name = typeof node.attrs?.name === 'string' ? node.attrs.name : 'unknown'
		return `:${name}${serializeMdcAttributes(node.attrs?.props)}`
	},
})
