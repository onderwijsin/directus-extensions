import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * Convert a ProseMirror node into the Markdown manager's serializable shape.
 * @param node ProseMirror node to convert.
 * @returns Equivalent Tiptap JSON content.
 */
function toJsonContent(node: ProseMirrorNode): JSONContent {
	const content: JSONContent[] = []
	node.forEach((child) => content.push(toJsonContent(child)))
	return {
		type: node.type.name,
		...(node.text ? { text: node.text } : {}),
		...(Object.keys(node.attrs).length ? { attrs: node.attrs } : {}),
		...(node.marks.length
			? { marks: node.marks.map((mark) => ({ type: mark.type.name, attrs: mark.attrs })) }
			: {}),
		...(content.length ? { content } : {}),
	}
}

/**
 * Serialize a ProseMirror document through the configured Tiptap Markdown manager.
 * @param editor Editor that owns the Markdown schema and serializers.
 * @param document ProseMirror document to serialize.
 * @returns Markdown or nothing when the editor has no Markdown manager.
 */
export function serializeMarkdownDocument(
	editor: Editor,
	document: ProseMirrorNode,
): string | undefined {
	return editor.markdown?.serialize(toJsonContent(document))
}

/**
 * Serialize a selected ProseMirror range while retaining its block structure and marks.
 * @param editor Active Markdown editor.
 * @param from Start of the selected range.
 * @param to End of the selected range.
 * @returns Selected Markdown or nothing for an invalid or unavailable range.
 */
export function serializeMarkdownRange(
	editor: Editor,
	from: number,
	to: number,
): string | undefined {
	if (from < 0 || from >= to || to > editor.state.doc.content.size) return
	const content = editor.state.doc.slice(from, to).content
	const document = editor.schema.topNodeType.create(null, content)
	return serializeMarkdownDocument(editor, document)
}
