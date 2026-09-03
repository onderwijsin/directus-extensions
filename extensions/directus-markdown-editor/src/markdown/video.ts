import type { MarkdownParseHelpers, MarkdownRendererHelpers, MarkdownToken } from '@tiptap/core'

import { Node } from '@tiptap/core'

interface VideoToken extends MarkdownToken {
	src?: string
}

interface VideoNodeAttributes {
	attrs?: { src?: unknown }
}

/** Persist videos as portable HTML inside the Markdown document. */
export const Video = Node.create({
	name: 'video',
	group: 'block',
	atom: true,
	selectable: true,

	addAttributes: /**
	 * Define the video node attributes.
	 * @returns The video attributes.
	 */ () => ({
		src: { default: '' },
	}),

	parseHTML: /**
	 * Define the HTML video parser.
	 * @returns The video HTML rule.
	 */ () => [{ tag: 'video' }],

	renderHTML: /**
	 * Render a video node as HTML.
	 * @param nodeView The video node view data.
	 * @returns The video HTML representation.
	 */ (nodeView) => {
		const { node, HTMLAttributes } = nodeView
		return ['video', { ...HTMLAttributes, src: node.attrs.src, controls: true }]
	},

	markdownTokenName: 'video',

	parseMarkdown: /**
	 * Parse a Markdown video token.
	 * @param token The video token.
	 * @param _helpers Markdown parser helpers.
	 * @returns The video node representation.
	 */ (token: MarkdownToken, _helpers: MarkdownParseHelpers) => ({
		type: 'video',
		attrs: { src: (token as VideoToken).src ?? '' },
	}),

	markdownTokenizer: {
		name: 'video',
		level: 'block' as const,
		start: /**
		 * Find the start of a video token.
		 * @param source The source Markdown.
		 * @returns The start offset.
		 */ (source: string) => source.search(/^<video\b/mu),
		tokenize: /**
		 * Tokenize a video HTML element.
		 * @param source The source Markdown.
		 * @returns The video token, if present.
		 */ (source: string) => {
			const match = /^<video\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/video>\s*(?:\n|$)/u.exec(
				source,
			)
			if (!match?.[1]) return undefined
			return { type: 'video', raw: match[0], src: match[1] }
		},
	},

	renderMarkdown: /**
	 * Render a video node as Markdown HTML.
	 * @param node The video node.
	 * @param _helpers Markdown renderer helpers.
	 * @returns The Markdown video representation.
	 */ (node: VideoNodeAttributes, _helpers: MarkdownRendererHelpers) =>
		typeof node.attrs?.src === 'string'
			? `<video src="${node.attrs.src.replaceAll('"', '&quot;')}" controls></video>`
			: '',
})
