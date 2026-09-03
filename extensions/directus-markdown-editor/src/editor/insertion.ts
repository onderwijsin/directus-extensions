import type { Editor } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

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
	if (component.slots.length === 0) {
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
 * @param component Parameter value.
 * @param props Parameter value.
 * @returns Callback result.
 */
export function updateComponent(
	editor: Editor,
	component: ComponentMetadata,
	props: Record<string, unknown>,
) {
	return editor
		.chain()
		.focus()
		.updateAttributes('mdcBlock', {
			name: component.name,
			props,
		})
		.run()
}
