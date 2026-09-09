import type { Editor } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

export type ComponentNodeType = 'mdcBlock' | 'mdcInline'

/**
 * Resolve component insertion metadata to the corresponding generic MDC node type.
 * @param component Component metadata supplied to the editor.
 * @returns Generic Tiptap node type used for a new component.
 */
export function resolveComponentNodeType(component: ComponentMetadata): ComponentNodeType {
	return component.nodeType === 'inline' ? 'mdcInline' : 'mdcBlock'
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
			.insertContent({ type: 'mdcInline', attrs: { name: component.name, props } })
			.run()
	}
	return editor
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
