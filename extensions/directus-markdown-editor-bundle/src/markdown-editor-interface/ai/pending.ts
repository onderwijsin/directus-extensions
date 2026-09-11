/* eslint-disable jsdoc-js/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Private ProseMirror lifecycle callbacks are self-contained. */
import type { Editor } from '@tiptap/core'

import { isDefined, isInteger, isRecord, isString } from '@onderwijsin/directus-extension-utils'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface PendingAiSuggestion {
	from: number
	to: number
	content: string
}

const key = new PluginKey<PendingAiSuggestion | null>('pendingAiSuggestion')
const clearMeta = 'clear'

/**
 *
 */
function parseSuggestion(value: unknown): PendingAiSuggestion | undefined {
	if (
		!isRecord(value) ||
		!isInteger(value.from) ||
		!isInteger(value.to) ||
		!isString(value.content)
	)
		return undefined
	if (value.from < 0 || value.to < value.from) return undefined
	return { from: value.from, to: value.to, content: value.content }
}

/**
 *
 */
function dispatchAction(dom: HTMLElement, action: 'cancel' | 'confirm' | 'retry', content: string) {
	dom.dispatchEvent(
		new CustomEvent('markdown-editor-ai-suggestion', {
			bubbles: true,
			detail: { action, content },
		}),
	)
}

/**
 *
 */
function suggestionWidget(suggestion: PendingAiSuggestion, editorDom: HTMLElement) {
	const wrapper = document.createElement('span')
	wrapper.className = 'ai-pending-suggestion'
	wrapper.dataset.pending = 'true'

	const editor = document.createElement('span')
	editor.className = 'ai-pending-suggestion__content'
	editor.contentEditable = 'true'
	editor.spellcheck = true
	editor.textContent = suggestion.content
	editor.setAttribute('aria-label', 'Pending AI suggestion')

	const actions = document.createElement('span')
	actions.className = 'ai-pending-suggestion__actions'
	for (const [action, label] of [
		['cancel', 'Cancel'],
		['retry', 'Retry'],
		['confirm', 'Apply'],
	] as const) {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = `ai-pending-suggestion__${action}`
		button.textContent = label
		button.addEventListener('mousedown', (event) => event.preventDefault())
		button.addEventListener('click', () =>
			dispatchAction(editorDom, action, editor.textContent ?? ''),
		)
		actions.append(button)
	}
	wrapper.append(editor, actions)
	return wrapper
}

/** Editor-only pending AI state. Decorations never enter the Markdown document. */
export const PendingAiSuggestionExtension = Extension.create({
	name: 'pendingAiSuggestion',
	/**
	 *
	 */
	addProseMirrorPlugins() {
		return [
			new Plugin<PendingAiSuggestion | null>({
				key,
				state: {
					/**
					 *
					 */
					init: () => null,
					/**
					 *
					 */
					apply(transaction, current) {
						if (transaction.getMeta(key) === clearMeta) return null
						const requested = parseSuggestion(transaction.getMeta(key))
						if (isDefined(requested)) return requested
						if (!current) return null
						const from = transaction.mapping.map(current.from)
						const to = transaction.mapping.map(current.to)
						return { ...current, from, to }
					},
				},
				props: {
					/**
					 *
					 */
					decorations(state) {
						const suggestion = key.getState(state)
						if (!suggestion) return DecorationSet.empty
						const decorations = []
						if (suggestion.from < suggestion.to)
							decorations.push(
								Decoration.inline(suggestion.from, suggestion.to, {
									class: 'ai-pending-suggestion__source',
								}),
							)
						decorations.push(
							Decoration.widget(
								suggestion.from,
								(view) => suggestionWidget(suggestion, view.dom),
								{
									key: `${suggestion.from}:${suggestion.to}:${suggestion.content}`,
									/** @returns Whether ProseMirror should ignore the widget event. */
									stopEvent: () => true,
								},
							),
						)
						return DecorationSet.create(state.doc, decorations)
					},
				},
			}),
		]
	},
})

/**
 * Show or replace the editor-only pending suggestion.
 * @param editor Target editor.
 * @param suggestion Pending range and generated content.
 * @returns Nothing.
 */
export function showPendingAiSuggestion(editor: Editor, suggestion: PendingAiSuggestion) {
	editor.view.dispatch(editor.state.tr.setMeta(key, suggestion).setMeta('addToHistory', false))
}

/**
 * Remove the editor-only pending suggestion.
 * @param editor Target editor.
 * @returns Nothing.
 */
export function clearPendingAiSuggestion(editor: Editor) {
	editor.view.dispatch(editor.state.tr.setMeta(key, clearMeta).setMeta('addToHistory', false))
}
