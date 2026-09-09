import type { NodeViewProps, NodeViewRenderer } from '@tiptap/core'
import type { Component } from 'vue'

import { VueNodeViewRenderer } from '@tiptap/vue-3'

/**
 * Bridge Vue SFC module typing to Tiptap's runtime NodeView props.
 * @param component Vue component used as a Tiptap NodeView.
 * @returns A Tiptap NodeView renderer.
 */
export function createVueNodeView(component: Component): NodeViewRenderer {
	return VueNodeViewRenderer(component as Component<NodeViewProps>)
}
