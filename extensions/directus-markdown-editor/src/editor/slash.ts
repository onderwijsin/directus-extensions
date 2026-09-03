import type { Editor, Range } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'

import SlashMenu from '../components/SlashMenu.vue'
import { insertComponent } from './insertion'

export interface SlashItem {
	id: string
	label: string
	description: string
	icon: string
	command: (editor: Editor) => void
}

const items: SlashItem[] = [
	{
		id: 'paragraph',
		label: 'Paragraph',
		description: 'Start with plain text',
		icon: '¶',

		command: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor) => editor.commands.setParagraph(),
	},
	{
		id: 'heading-1',
		label: 'Heading 1',
		description: 'Large section heading',
		icon: 'H1',

		command: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor) => editor.commands.toggleHeading({ level: 1 }),
	},
	{
		id: 'heading-2',
		label: 'Heading 2',
		description: 'Medium section heading',
		icon: 'H2',

		command: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor) => editor.commands.toggleHeading({ level: 2 }),
	},
	{
		id: 'bullet-list',
		label: 'Bullet list',
		description: 'Create a simple list',
		icon: '•',

		command: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor) => editor.commands.toggleBulletList(),
	},
	{
		id: 'ordered-list',
		label: 'Numbered list',
		description: 'Create a numbered list',
		icon: '1.',

		command: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor) => editor.commands.toggleOrderedList(),
	},
	{
		id: 'blockquote',
		label: 'Blockquote',
		description: 'Highlight a quotation',
		icon: '“',

		command: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor) => editor.commands.toggleBlockquote(),
	},
	{
		id: 'horizontal-rule',
		label: 'Divider',
		description: 'Separate sections',
		icon: '—',

		command: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor) => editor.commands.setHorizontalRule(),
	},
]

/**
 * Editor callback.
 * @param renderer Parameter value.
 * @param clientRect Parameter value.
 * @returns Callback result.
 */
function positionRenderer(renderer: VueRenderer, clientRect?: (() => DOMRect | null) | null) {
	const element = renderer.element
	const rect = clientRect?.()
	if (!(element instanceof HTMLElement) || !rect) return
	const offsetParent = element.offsetParent
	const parentRect = offsetParent?.getBoundingClientRect()
	element.style.position = 'absolute'
	element.style.left = `${rect.left - (parentRect?.left ?? 0) + (offsetParent?.scrollLeft ?? window.scrollX)}px`
	element.style.top = `${rect.bottom - (parentRect?.top ?? 0) + (offsetParent?.scrollTop ?? window.scrollY) + 6}px`
	element.style.zIndex = '1000'
}

interface SlashMenuRenderer {
	onKeyDown: (event: KeyboardEvent) => boolean
}

/**
 * Editor callback.
 * @param value Parameter value.
 * @returns Callback result.
 */
function isSlashMenuRenderer(value: unknown): value is SlashMenuRenderer {
	return (
		value !== null &&
		typeof value === 'object' &&
		'onKeyDown' in value &&
		typeof value.onKeyDown === 'function'
	)
}

/**
 * Editor callback.
 * @param renderer Parameter value.
 * @param event Parameter value.
 * @returns Callback result.
 */
function handleRendererKeyDown(renderer: VueRenderer | undefined, event: KeyboardEvent): boolean {
	const component = renderer?.ref
	return isSlashMenuRenderer(component) ? component.onKeyDown(event) : false
}

/**
 * Editor callback.
 * @param getComponents Parameter value.
 * @returns Callback result.
 */
export function createSlashExtension(
	getComponents: () => ComponentMetadata[] /**
	 * Editor callback.
	 * @returns Callback result.
	 */ = () => [],
) {
	return Extension.create({
		name: 'slashMenu',

		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		addProseMirrorPlugins() {
			return [
				Suggestion<SlashItem, SlashItem>({
					editor: this.editor,
					char: '/',
					allowSpaces: false,

					items: /**
					 * Editor callback.
					 * @param { query } Parameter value.
					 * @returns Callback result.
					 */ ({ query }: { query: string }) =>
						[
							...items,
							...getComponents().map(
								/**
								 * Editor callback.
								 * @param component Parameter value.
								 * @returns Callback result.
								 */
								(component) => ({
									id: `component:${component.name}`,
									label: component.label,
									description: component.description ?? 'Insert component',
									icon: '◈',

									command: /**
									 * Editor callback.
									 * @param editor Parameter value.
									 * @returns Callback result.
									 */ (editor: Editor) => insertComponent(editor, component),
								}),
							),
						].filter(
							/**
							 * Editor callback.
							 * @param item Parameter value.
							 * @returns Callback result.
							 */
							(item) =>
								`${item.label} ${item.id}`
									.toLowerCase()
									.includes(query.toLowerCase()),
						),

					command: /**
					 * Editor callback.
					 * @param { editor, range, props } Parameter value.
					 * @returns Callback result.
					 */ ({
						editor,
						range,
						props,
					}: {
						editor: Editor
						range: Range
						props: SlashItem
					}) => {
						editor.chain().focus().deleteRange(range).run()
						props.command(editor)
					},

					render: /**
					 * Editor callback.
					 * @returns Callback result.
					 */ () => {
						let renderer: VueRenderer | undefined
						return {
							onStart: /**
							 * Editor callback.
							 * @param props Parameter value.
							 * @returns Callback result.
							 */ (props: SuggestionProps<SlashItem, SlashItem>) => {
								renderer = new VueRenderer(SlashMenu, {
									editor: props.editor,
									props: {
										items: props.items,
										query: props.query,
										command: props.command,
									},
								})
								if (renderer.element) {
									const editorRoot =
										props.editor.view.dom.closest('.markdown-editor')
									;(editorRoot ?? document.body).appendChild(renderer.element)
								}
								positionRenderer(renderer, props.clientRect)
							},

							onUpdate: /**
							 * Editor callback.
							 * @param props Parameter value.
							 * @returns Callback result.
							 */ (props: SuggestionProps<SlashItem, SlashItem>) => {
								renderer?.updateProps({
									items: props.items,
									query: props.query,
									command: props.command,
								})
								if (renderer) positionRenderer(renderer, props.clientRect)
							},

							onKeyDown: /**
							 * Editor callback.
							 * @param { event } Parameter value.
							 * @returns Callback result.
							 */ ({ event }: SuggestionKeyDownProps) =>
								handleRendererKeyDown(renderer, event),

							onExit: /**
							 * Editor callback.
							 * @returns Callback result.
							 */ () => {
								if (renderer?.element?.parentNode)
									renderer.element.parentNode.removeChild(renderer.element)
								renderer?.destroy()
								renderer = undefined
							},
						}
					},
				}),
			]
		},
	})
}
