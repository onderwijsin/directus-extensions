/* eslint-disable jsdoc-js/require-jsdoc -- Suggestion lifecycle callbacks are private Tiptap integration details. */
import type { Editor, Range } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'

import SlashMenu from '../components/SlashMenu.vue'
import {
	createEditorCommands,
	filterEditorCommands,
	isEditorToolEnabled,
	resolveCommands,
	slashMenuGroups,
} from './commands'
import { componentRequiresProps, insertComponent, resolveComponentDefaultProps } from './insertion'

export interface SlashMenuActions {
	openImage?: () => void
	openVideo?: () => void
	openComponent?: (component: ComponentMetadata) => void
}

export interface SlashItem {
	id: string
	label: string
	description: string
	icon: string
	group: string
	aliases: string[]
	command: (editor: Editor) => boolean
}

/**
 * Create all slash-menu items from the shared command catalog and component metadata.
 * @param components Available component metadata.
 * @param actions External editor actions.
 * @param enabledTools Selected interface tools.
 * @returns Ordered slash-menu items.
 */
export function createSlashItems(
	components: ComponentMetadata[],
	actions: SlashMenuActions = {},
	enabledTools?: readonly string[] | null,
): SlashItem[] {
	const commands = filterEditorCommands(createEditorCommands(), enabledTools)
	const configured = slashMenuGroups.flatMap((group) =>
		resolveCommands(commands, group.commandIds).map((item) => ({
			id: item.id,
			label: item.label,
			description: item.description,
			icon: item.icon,
			group: group.label,
			aliases: item.aliases,
			command: item.execute,
		})),
	)
	const componentItems = isEditorToolEnabled(enabledTools, 'component')
		? components.map((component) => ({
				id: `component:${component.name}`,
				label: component.label,
				description: component.description ?? `Insert the ${component.label} component`,
				icon: 'widgets',
				group: 'Components',
				aliases: [component.name, 'component', 'mdc', 'block'],
				command: (editor: Editor) => {
					if (componentRequiresProps(component)) {
						actions.openComponent?.(component)
						return Boolean(actions.openComponent)
					}
					return insertComponent(
						editor,
						component,
						resolveComponentDefaultProps(component),
					)
				},
			}))
		: []
	const mediaItems: SlashItem[] = [
		{
			id: 'insert-image',
			label: 'Image',
			description: 'Insert an image from Directus or a URL',
			icon: 'image',
			group: 'Insert',
			aliases: ['photo', 'picture', 'asset', 'upload'],
			command: () => {
				actions.openImage?.()
				return Boolean(actions.openImage)
			},
		},
		{
			id: 'insert-video',
			label: 'Video',
			description: 'Insert video media from Directus or a URL',
			icon: 'movie',
			group: 'Insert',
			aliases: ['media', 'movie', 'clip', 'asset', 'upload'],
			command: () => {
				actions.openVideo?.()
				return Boolean(actions.openVideo)
			},
		},
	].filter((item) =>
		isEditorToolEnabled(enabledTools, item.id === 'insert-image' ? 'image' : 'video'),
	)
	return [...configured, ...mediaItems, ...componentItems]
}

/**
 * Filter slash items across labels, ids, descriptions, groups, and alternate names.
 * @param items Available slash-menu items.
 * @param query User-entered query.
 * @returns Matching slash-menu items.
 */
export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
	const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
	if (terms.length === 0) return items
	return items.filter((item) => {
		const haystack = [item.label, item.id, item.description, item.group, ...item.aliases]
			.join(' ')
			.toLocaleLowerCase()
		return terms.every((term) => haystack.includes(term))
	})
}

interface SlashMenuRenderer {
	onKeyDown: (event: KeyboardEvent) => boolean
}

function isSlashMenuRenderer(value: unknown): value is SlashMenuRenderer {
	return (
		value !== null &&
		typeof value === 'object' &&
		'onKeyDown' in value &&
		typeof value.onKeyDown === 'function'
	)
}

/**
 * Create the Tiptap slash suggestion extension.
 * @param getComponents Resolve the latest component metadata.
 * @param actions External editor actions.
 * @param getEnabledTools Resolve the current interface tool selection.
 * @returns Tiptap extension.
 */
export function createSlashExtension(
	getComponents: () => ComponentMetadata[] = () => [],
	actions: SlashMenuActions = {},
	getEnabledTools: () => readonly string[] | null | undefined = () => undefined,
) {
	return Extension.create({
		name: 'slashMenu',
		addProseMirrorPlugins() {
			return [
				Suggestion<SlashItem, SlashItem>({
					editor: this.editor,
					char: '/',
					allowSpaces: true,
					startOfLine: true,
					placement: 'bottom-start',
					offset: { mainAxis: 6 },
					flip: true,
					allow: ({ state, range }) =>
						state.doc.resolve(range.from).parent.type.name !== 'codeBlock',
					items: ({ query }: { query: string }) =>
						filterSlashItems(
							createSlashItems(getComponents(), actions, getEnabledTools()),
							query,
						),
					command: ({
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
					render: () => {
						let renderer: VueRenderer | undefined
						let unmount: (() => void) | undefined
						return {
							onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
								renderer = new VueRenderer(SlashMenu, {
									editor: props.editor,
									props: {
										items: props.items,
										query: props.query,
										command: props.command,
									},
								})
								if (renderer.element instanceof HTMLElement) {
									unmount = props.mount(renderer.element)
								}
							},
							onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
								renderer?.updateProps({
									items: props.items,
									query: props.query,
									command: props.command,
								})
							},
							onKeyDown: ({ event }: SuggestionKeyDownProps) => {
								const component = renderer?.ref
								return isSlashMenuRenderer(component)
									? component.onKeyDown(event)
									: false
							},
							onExit: () => {
								unmount?.()
								renderer?.destroy()
								unmount = undefined
								renderer = undefined
							},
						}
					},
				}),
			]
		},
	})
}
