import type { MarkdownParseHelpers, MarkdownRendererHelpers, MarkdownToken } from '@tiptap/core'

import { isString } from '@onderwijsin/directus-extension-utils'
import { Node } from '@tiptap/core'

import VideoNodeView from '../components/nodes/VideoNodeView.vue'
import { createVueNodeView } from '../editor/node-view'
import { parseVideoEmbed, videoEmbedPermissions, videoEmbedUrl } from '../editor/video-embed'

interface VideoNodeAttributes {
	attrs?: { src?: unknown; allow?: unknown }
}

/**
 * Read and decode one supported attribute from a Markdown HTML opening tag.
 * @param source Opening-tag attributes.
 * @param name Supported attribute name.
 * @returns Decoded attribute value, if present.
 */
function readAttribute(source: string, name: 'src' | 'allow'): string | undefined {
	const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'u').exec(` ${source}`)
	return (match?.[1] ?? match?.[2])
		?.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&amp;', '&')
}

/**
 * Escape an HTML attribute while preserving query parameters across Markdown round trips.
 * @param value Attribute value.
 * @returns Escaped HTML attribute value.
 */
function escapeAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

/** Persist videos as portable HTML inside the Markdown document. */
export const Video = Node.create({
	name: 'video',
	group: 'block',
	atom: true,
	selectable: true,
	addNodeView: /**
	 * Render local and provider videos inside Studio.
	 * @returns Video node view renderer.
	 */ () => createVueNodeView(VideoNodeView),

	addAttributes: /**
	 * Define the video node attributes.
	 * @returns The video attributes.
	 */ () => ({
		src: { default: '' },
		allow: { default: null, rendered: false },
	}),

	parseHTML: /**
	 * Define the HTML video parser.
	 * @returns The video HTML rule.
	 */ () => [
		{ tag: 'video' },
		{
			tag: 'iframe[src]',
			/**
			 * Accept provider players and normalize their persisted source.
			 * @param element Candidate iframe element.
			 * @returns Video attributes, or false for an unsupported iframe.
			 */
			getAttrs: (element) => {
				const video = parseVideoEmbed(
					element.getAttribute('src') ?? '',
					element.getAttribute('allow') ?? undefined,
					element.hasAttribute('allowfullscreen'),
				)
				return video
					? { src: videoEmbedUrl(video), allow: videoEmbedPermissions(video.options) }
					: false
			},
		},
	],

	renderHTML: /**
	 * Render a video node as HTML.
	 * @param nodeView The video node view data.
	 * @returns The video HTML representation.
	 */ (nodeView) => {
		const { node, HTMLAttributes } = nodeView
		const video = isString(node.attrs.src)
			? parseVideoEmbed(
					node.attrs.src,
					isString(node.attrs.allow) ? node.attrs.allow : undefined,
				)
			: undefined
		if (video)
			return [
				'iframe',
				{
					src: videoEmbedUrl(video),
					allow: videoEmbedPermissions(video.options),
					...(video.options.allowFullscreen ? { allowfullscreen: true } : {}),
				},
			]
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
		attrs: {
			src: isString(token.src) ? token.src : '',
			allow: isString(token.allow) ? token.allow : null,
		},
	}),

	markdownTokenizer: {
		name: 'video',
		level: 'block' as const,
		start: /**
		 * Find the start of a video token.
		 * @param source The source Markdown.
		 * @returns The start offset.
		 */ (source: string) => source.search(/^<(?:video|iframe)\b/mu),
		tokenize: /**
		 * Tokenize a video HTML element.
		 * @param source The source Markdown.
		 * @returns The video token, if present.
		 */ (source: string) => {
			const match = /^<(video|iframe)\b([^>]*)>\s*<\/\1>\s*(?:\n|$)/u.exec(source)
			if (!match) return undefined
			const attributes = match[2] ?? ''
			const src = readAttribute(attributes, 'src')
			if (!src) return undefined
			const video = parseVideoEmbed(
				src,
				readAttribute(attributes, 'allow'),
				match[1] === 'iframe'
					? /(?:^|\s)allowfullscreen(?:\s|=|$)/u.test(attributes)
					: undefined,
			)
			if (match[1] === 'iframe' && !video) return undefined
			return {
				type: 'video',
				raw: match[0],
				src: video ? videoEmbedUrl(video) : src,
				allow: video ? videoEmbedPermissions(video.options) : null,
			}
		},
	},

	renderMarkdown: /**
	 * Render a video node as Markdown HTML.
	 * @param node The video node.
	 * @param _helpers Markdown renderer helpers.
	 * @returns The Markdown video representation.
	 */ (node: VideoNodeAttributes, _helpers: MarkdownRendererHelpers) => {
		if (!isString(node.attrs?.src)) return ''
		const video = parseVideoEmbed(
			node.attrs.src,
			isString(node.attrs.allow) ? node.attrs.allow : undefined,
		)
		const src = escapeAttribute(video ? videoEmbedUrl(video) : node.attrs.src)
		return video
			? `<iframe src="${src}" allow="${escapeAttribute(videoEmbedPermissions(video.options))}"${video.options.allowFullscreen ? ' allowfullscreen' : ''}></iframe>`
			: `<video src="${src}" controls></video>`
	},
})
