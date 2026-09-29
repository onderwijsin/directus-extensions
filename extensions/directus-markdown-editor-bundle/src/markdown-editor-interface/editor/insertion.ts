import type { Editor } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

import { fromEntries, toEntries } from '@onderwijsin/directus-extension-utils'
import { TextSelection } from '@tiptap/pm/state'

export type ComponentNodeType = 'mdcBlock' | 'mdcInline'

/**
 * Resolve component insertion metadata to the corresponding generic MDC node type.
 * @param component Component metadata supplied to the editor.
 * @returns Generic Tiptap node type used for a new component.
 */
export function resolveComponentNodeType(component: ComponentMetadata): ComponentNodeType {
	return component.slots.length > 0 || component.nodeType === 'block' ? 'mdcBlock' : 'mdcInline'
}

/**
 * Collect explicit component prop defaults for insertion paths without a props drawer.
 * @param component Component metadata supplied to the editor.
 * @returns Prop values that declare a default.
 */
export function resolveComponentDefaultProps(
	component: ComponentMetadata,
): Record<string, unknown> {
	return fromEntries(
		toEntries(component.props)
			.filter(([, definition]) => definition.default !== undefined)
			.map(([name, definition]) => [name, definition.default]),
	)
}

/**
 * Determine whether insertion must collect required component props first.
 * @param component Component metadata supplied to the editor.
 * @returns Whether at least one required prop has no explicit default.
 */
export function componentRequiresProps(component: ComponentMetadata): boolean {
	return toEntries(component.props).some(
		([, definition]) => definition.required && definition.default === undefined,
	)
}

/**
 * Editor callback.
 * @param editor Parameter value.
 * @param component Parameter value.
 * @param props Parameter value.
 * @returns Callback result.
 */
export function insertComponent(
	editor: Editor,
	component: ComponentMetadata,
	props: Record<string, unknown> = {},
) {
	const attributes = { name: component.name, props, depth: 2, propsFormat: 'inline' }
	if (resolveComponentNodeType(component) === 'mdcInline') {
		return editor
			.chain()
			.focus()
			.insertContent([
				{ type: 'mdcInline', attrs: { name: component.name, props } },
				{ type: 'text', text: ' ' },
			])
			.run()
	}
	const inserted = editor
		.chain()
		.focus()
		.insertContent({
			type: 'mdcBlock',
			attrs: attributes,
			content: component.slots.map(
				/**
				 * Editor callback.
				 * @param slot Parameter value.
				 * @returns Callback result.
				 */
				(slot) => ({
					type: 'mdcSlot',
					attrs: { name: slot },
					content: [{ type: 'paragraph' }],
				}),
			),
		})
		.run()
	if (!inserted || component.slots.length === 0) return inserted

	let insertedBlockPosition: number | undefined
	const selectionPosition = editor.state.selection.from
	editor.state.doc.descendants((node, position) => {
		if (
			node.type.name === 'mdcBlock' &&
			node.attrs.name === component.name &&
			position < selectionPosition
		) {
			insertedBlockPosition = position
		}
	})
	if (insertedBlockPosition === undefined) return inserted
	editor.view.dispatch(
		editor.state.tr
			.setSelection(TextSelection.create(editor.state.doc, insertedBlockPosition + 3))
			.scrollIntoView(),
	)
	return true
}

/**
 * Editor callback.
 * @param editor Parameter value.
 * @param targetNodeType The type of MDC node.
 * @param props Parameter value.
 * @returns Callback result.
 */
export function updateComponent(
	editor: Editor,
	targetNodeType: ComponentNodeType,
	props: Record<string, unknown>,
) {
	return editor.chain().focus().updateAttributes(targetNodeType, { props }).run()
}

/**
 * Update a component occurrence and reconcile its direct child slots with current metadata.
 * Supported slot content is preserved, removed slots are deleted, and new slots receive a paragraph.
 * @param editor Active editor.
 * @param position Component document position.
 * @param props Next component properties.
 * @param slots Current metadata slot names.
 * @returns Whether the component occurrence was replaced.
 */
export function refreshComponentAt(
	editor: Editor,
	position: number,
	props: Record<string, unknown>,
	slots?: readonly string[],
) {
	const node = editor.state.doc.nodeAt(position)
	if (!node || (node.type.name !== 'mdcBlock' && node.type.name !== 'mdcInline')) return false
	if (node.type.name === 'mdcInline') {
		if (slots?.length) {
			return editor.commands.insertContentAt(
				{ from: position, to: position + node.nodeSize },
				{
					type: 'mdcBlock',
					attrs: { name: node.attrs.name, props, depth: 2, propsFormat: 'inline' },
					content: slots.map((name) => ({
						type: 'mdcSlot',
						attrs: { name },
						content: [{ type: 'paragraph' }],
					})),
				},
			)
		}
		editor.view.dispatch(
			editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, props }),
		)
		return true
	}
	if (!slots) {
		editor.view.dispatch(
			editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, props }),
		)
		return true
	}
	const slotType = editor.schema.nodes.mdcSlot
	const paragraphType = editor.schema.nodes.paragraph
	if (!slotType || !paragraphType) return false
	const existingSlots = new Map<string, typeof node>()
	const otherContent: (typeof node)[] = []
	node.forEach((child) => {
		if (child.type.name === 'mdcSlot' && typeof child.attrs.name === 'string') {
			if (!existingSlots.has(child.attrs.name)) existingSlots.set(child.attrs.name, child)
		} else otherContent.push(child)
	})
	const content = slots.map(
		(name) => existingSlots.get(name) ?? slotType.create({ name }, [paragraphType.create()]),
	)
	const replacement = node.type.create({ ...node.attrs, props }, [...content, ...otherContent])
	editor.view.dispatch(
		editor.state.tr.replaceWith(position, position + node.nodeSize, replacement),
	)
	return true
}
