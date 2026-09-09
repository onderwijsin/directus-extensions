import type { Editor } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

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
	return Object.fromEntries(
		Object.entries(component.props)
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
	return Object.values(component.props).some(
		(definition) => definition.required && definition.default === undefined,
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
