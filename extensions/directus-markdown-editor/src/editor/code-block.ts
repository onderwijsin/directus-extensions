import type {
	Editor,
	JSONContent,
	MarkdownParseHelpers,
	MarkdownRendererHelpers,
	MarkdownToken,
} from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { BundledLanguage } from 'shiki'

import { findChildren } from '@tiptap/core'
import CodeBlock from '@tiptap/extension-code-block'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { bundledLanguages, getSingletonHighlighter } from 'shiki'

import CodeBlockView from '../components/CodeBlockView.vue'
import { createVueNodeView } from './node-view'

interface CodeBlockInfo {
	language: string | null
	filename: string | null
}

type CodeBlockNode = JSONContent & {
	attrs?: { language?: unknown; filename?: unknown; collapse?: unknown }
}

type MarkdownHighlighter = Awaited<ReturnType<typeof getSingletonHighlighter>>

const shikiPluginKey = new PluginKey<DecorationSet>('markdownEditorShiki')
let activeHighlighter: MarkdownHighlighter | undefined

/**
 * Check whether Shiki bundles a language identifier.
 * @param language Language identifier to check.
 * @returns Whether Shiki bundles the language.
 */
function isBundledLanguage(language: string): language is BundledLanguage {
	return language in bundledLanguages
}

/**
 * Resolve unknown code metadata to a Shiki-supported language.
 * @param language Code-block language metadata.
 * @returns A bundled language or the plain-text fallback.
 */
function resolveLanguage(language: unknown): BundledLanguage | 'plaintext' {
	return typeof language === 'string' && isBundledLanguage(language) ? language : 'plaintext'
}

/**
 * Convert Shiki's token style object into an inline CSS declaration.
 * @param styles Token styles returned by Shiki.
 * @returns An inline CSS declaration.
 */
function serializeStyles(styles: Record<string, string>): string {
	return Object.entries(styles)
		.map(([property, value]) => `${property}:${value}`)
		.join(';')
}

/**
 * Build syntax-highlighting decorations for every code block in a document.
 * @param doc ProseMirror document to highlight.
 * @returns Decorations for the document's code blocks.
 */
function createDecorations(doc: ProseMirrorNode): DecorationSet {
	if (!activeHighlighter) return DecorationSet.empty
	const decorations: Decoration[] = []
	const loadedLanguages = new Set(activeHighlighter.getLoadedLanguages())
	for (const block of findChildren(doc, (node) => node.type.name === 'codeBlock')) {
		let position = block.pos + 1
		const language = resolveLanguage(block.node.attrs.language)
		if (language !== 'plaintext' && !loadedLanguages.has(language)) continue
		const result = activeHighlighter.codeToTokens(block.node.textContent, {
			lang: language,
			themes: { light: 'github-light', dark: 'github-dark' },
		})
		decorations.push(
			Decoration.node(block.pos, block.pos + block.node.nodeSize, { class: 'shiki' }),
		)
		for (const line of result.tokens) {
			for (const token of line) {
				const end = position + token.content.length
				decorations.push(
					Decoration.inline(position, end, {
						style: serializeStyles(token.htmlStyle ?? {}),
					}),
				)
				position = end
			}
			position += 1
		}
	}
	return DecorationSet.create(doc, decorations)
}

/**
 * Load the singleton highlighter and every language used by the document.
 * @param doc ProseMirror document whose languages should be loaded.
 * @returns The configured shared Shiki highlighter.
 */
async function loadHighlighter(doc: ProseMirrorNode): Promise<MarkdownHighlighter> {
	const languages = new Set<BundledLanguage>()
	for (const block of findChildren(doc, (node) => node.type.name === 'codeBlock')) {
		const language = block.node.attrs.language
		if (typeof language === 'string' && isBundledLanguage(language)) languages.add(language)
	}
	return getSingletonHighlighter({
		themes: ['github-light', 'github-dark'],
		langs: [...languages],
	})
}

/**
 * Load and apply Shiki highlighting independently of the editor's editable state.
 * @param editor Editor whose current document should be highlighted.
 * @returns A promise that resolves after highlighting has refreshed.
 */
export async function refreshCodeHighlighting(editor: Editor): Promise<void> {
	const highlighter = await loadHighlighter(editor.state.doc)
	if (editor.isDestroyed) return
	activeHighlighter = highlighter
	editor.view.dispatch(editor.state.tr.setMeta(shikiPluginKey, true))
}

/**
 * Create a lifecycle-safe ProseMirror plugin for asynchronous Shiki highlighting.
 * @returns A Shiki decoration plugin.
 */
function createShikiPlugin(): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key: shikiPluginKey,
		state: {
			/** @returns An empty decoration set while Shiki initializes. */
			init: () => DecorationSet.empty,
			/**
			 * Recalculate decorations after document changes or Shiki refreshes.
			 * @param transaction Current transaction.
			 * @param decorations Previous decoration set.
			 * @param _oldState Previous editor state.
			 * @param newState Current editor state.
			 * @returns The updated decoration set.
			 */
			apply: (transaction, decorations, _oldState, newState) => {
				if (transaction.docChanged || transaction.getMeta(shikiPluginKey)) {
					return createDecorations(newState.doc)
				}
				return decorations.map(transaction.mapping, transaction.doc)
			},
		},
		props: {
			/**
			 * Expose the current decorations to ProseMirror.
			 * @param state Current editor state.
			 * @returns The current decoration set.
			 */
			decorations: (state) => shikiPluginKey.getState(state),
		},
		/**
		 * Initialize and refresh highlighting while the editor view is alive.
		 * @param view Current editor view.
		 * @returns ProseMirror plugin-view lifecycle hooks.
		 */
		view: (view) => {
			let destroyed = false
			let revision = 0
			/** @returns A promise that resolves after highlighting refreshes. */
			const refresh = async () => {
				const currentRevision = ++revision
				const highlighter = await loadHighlighter(view.state.doc)
				if (destroyed || view.isDestroyed || currentRevision !== revision) return
				activeHighlighter = highlighter
				view.dispatch(view.state.tr.setMeta(shikiPluginKey, true))
			}
			void refresh().catch(() => undefined)
			return {
				/**
				 * Refresh highlighting when the document changes.
				 * @param currentView Current editor view.
				 * @param previousState Previous editor state.
				 * @returns Nothing.
				 */
				update: (currentView, previousState) => {
					if (!currentView.state.doc.eq(previousState.doc)) {
						void refresh().catch(() => undefined)
					}
				},
				/** @returns Nothing. */
				destroy: () => {
					destroyed = true
					revision += 1
				},
			}
		},
	})
}

/**
 * Split Nuxt Content fenced-code metadata into language and filename values.
 * @param value The marked code-token info string.
 * @returns Parsed code-block metadata.
 */
export function parseCodeBlockInfo(value: unknown): CodeBlockInfo {
	if (typeof value !== 'string') return { language: null, filename: null }
	const match = /^([^\s[]+)?(?:\s+\[([^\]\n]+)\])?\s*$/u.exec(value.trim())
	return {
		language: match?.[1] ?? null,
		filename: match?.[2] ?? null,
	}
}

/**
 * Convert a Markdown code token into the editor's enriched code-block node.
 * @param token Markdown code token.
 * @param helpers Tiptap Markdown parsing helpers.
 * @param collapse Whether the code block came from a code-collapse wrapper.
 * @returns A code-block JSON node.
 */
export function parseCodeBlockToken(
	token: MarkdownToken,
	helpers: MarkdownParseHelpers,
	collapse = false,
) {
	const info = parseCodeBlockInfo(token.lang)
	return helpers.createNode(
		'codeBlock',
		{ ...info, collapse },
		token.text ? [helpers.createTextNode(token.text)] : [],
	)
}

/**
 * Render an enriched code-block node using Nuxt Content's MDC conventions.
 * @param node Code-block JSON node.
 * @param helpers Tiptap Markdown rendering helpers.
 * @returns Portable Markdown or MDC source.
 */
export function renderCodeBlock(node: CodeBlockNode, helpers: MarkdownRendererHelpers): string {
	const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
	const filename = typeof node.attrs?.filename === 'string' ? node.attrs.filename : ''
	const info = [language, filename ? `[${filename}]` : ''].filter(Boolean).join(' ')
	const content = node.content ? helpers.renderChildren(node.content) : ''
	const fence = `\`\`\`${info}\n${content}\n\`\`\``
	return node.attrs?.collapse === true ? `::code-collapse\n\n${fence}\n\n::` : fence
}

/** Shiki-backed code blocks with editable Nuxt Content metadata. */
export const MarkdownCodeBlock = CodeBlock.extend({
	/** @returns Code-block attributes including filename and collapse metadata. */
	addAttributes() {
		return {
			...this.parent?.(),
			filename: { default: null, rendered: false },
			collapse: { default: false, rendered: false },
		}
	},

	/** @returns A Vue node-view renderer for editable code blocks. */
	addNodeView() {
		return createVueNodeView(CodeBlockView)
	},

	/** @returns Code-block shortcuts with indentation preserved across new lines. */
	addKeyboardShortcuts() {
		return {
			...this.parent?.(),
			/** @returns Whether the shortcut inserted an indented new line. */
			Enter: () => {
				const { $from, empty } = this.editor.state.selection
				if (!empty || $from.parent.type !== this.type) return false
				const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset)
				const currentLine = textBeforeCursor.slice(textBeforeCursor.lastIndexOf('\n') + 1)
				const indentation = /^\s*/u.exec(currentLine)?.[0] ?? ''
				if (!indentation || currentLine.trim().length === 0) return false
				return this.editor.commands.insertContent(`\n${indentation}`)
			},
		}
	},

	/**
	 * Parse fenced code and Nuxt Content code-collapse tokens.
	 * @param token Markdown token to parse.
	 * @param helpers Tiptap Markdown parsing helpers.
	 * @returns A code-block node or no nodes for unrelated tokens.
	 */
	parseMarkdown(token, helpers) {
		if (
			token.raw?.startsWith('```') === false &&
			token.raw?.startsWith('~~~') === false &&
			token.codeBlockStyle !== 'indented'
		) {
			return []
		}
		return parseCodeBlockToken(token, helpers)
	},

	/**
	 * Serialize code blocks using Nuxt Content's documented Markdown syntax.
	 * @param node Code-block node to serialize.
	 * @param helpers Tiptap Markdown rendering helpers.
	 * @returns Portable Markdown or MDC source.
	 */
	renderMarkdown(node, helpers) {
		return renderCodeBlock(node, helpers)
	},

	/** @returns The asynchronous Shiki syntax-highlighting plugin. */
	addProseMirrorPlugins() {
		return [createShikiPlugin()]
	},
})
