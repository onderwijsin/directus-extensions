import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

import { isString } from '@onderwijsin/directus-extension-utils'
import { ResizableNodeView } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { z } from 'zod'

import { parseMdcAttributes, readMdcAttributeBlock } from '../markdown/attributes'
import { imagePreviewUrl } from './media'

const pixelWidthSchema = z
	.union([
		z.number(),
		z
			.string()
			.regex(/^\d+(?:\.\d+)?$/u)
			.transform(Number),
	])
	.pipe(z.number().positive())
	.transform(Math.round)
	.pipe(z.int().positive())

/**
 * Normalize a preferred pixel width, leaving absent or invalid values full width.
 * @param value External width attribute.
 * @returns A positive integer width or null.
 */
function pixelWidth(value: unknown): number | null {
	const result = pixelWidthSchema.safeParse(value)
	return result.success ? result.data : null
}

/** Standard images with Comark width attributes and Directus-aware resize previews. */
export const MarkdownImage = Image.extend({
	/**
	 * Render the persisted source as a safe preview URL.
	 * @param context Image HTML attributes.
	 * @param context.HTMLAttributes Rendered image attributes.
	 * @returns Image DOM specification.
	 */
	renderHTML({ HTMLAttributes }) {
		return [
			'img',
			{
				...HTMLAttributes,
				src: isString(HTMLAttributes.src) ? imagePreviewUrl(HTMLAttributes.src) : undefined,
				width: pixelWidth(HTMLAttributes.width),
				height: null,
			},
		]
	},

	markdownTokenizer: {
		name: 'image',
		level: 'inline',
		/**
		 * Locate a possible Markdown image.
		 * @param source Remaining Markdown.
		 * @returns Image start offset.
		 */
		start: (source) => source.indexOf('!['),
		/**
		 * Reuse the standard image lexer and consume its trailing width block.
		 * @param source Remaining Markdown.
		 * @param _tokens Previously parsed tokens.
		 * @param lexer Standard Markdown lexer.
		 * @returns Image token with a width, when a width block follows it.
		 */
		tokenize(source, _tokens, lexer) {
			if (!source.startsWith('![')) return undefined
			for (
				let index = source.indexOf('{');
				index >= 0;
				index = source.indexOf('{', index + 1)
			) {
				const block = readMdcAttributeBlock(source.slice(index))
				if (!block || !/^\s*width\s*=/u.test(block.source)) continue
				const attributes = parseMdcAttributes(block.source)
				if (Object.keys(attributes).some((key) => key !== 'width')) continue
				const prefix = source.slice(0, index)
				const tokens = lexer.inlineTokens(prefix)
				const image = tokens[0]
				if (tokens.length !== 1 || image?.type !== 'image' || image.raw !== prefix) continue
				return {
					...image,
					raw: source.slice(0, index + block.length),
					width: pixelWidth(attributes.width),
				}
			}
			return undefined
		},
	},

	/**
	 * Restore standard image attributes and its optional preferred width.
	 * @param token Parsed Markdown image.
	 * @param helpers Markdown node factories.
	 * @returns Image node with no persisted height.
	 */
	parseMarkdown(token, helpers) {
		return helpers.createNode('image', {
			src: token.href,
			alt: token.text,
			title: token.title,
			width: pixelWidth(token.width),
			height: null,
		})
	},

	/**
	 * Append a Comark-compatible width to the standard image syntax.
	 * @param node Image node.
	 * @returns Portable Markdown retaining the original source.
	 */
	renderMarkdown(node) {
		const src = node.attrs?.src ?? ''
		const alt = node.attrs?.alt ?? ''
		const title = node.attrs?.title ?? ''
		const markdown = title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
		const width = pixelWidth(node.attrs?.width)
		return width === null ? markdown : `${markdown}{width="${width}"}`
	},

	/**
	 * Create a native Tiptap resize view that commits only width.
	 * @returns Image node view factory.
	 */
	addNodeView() {
		return ({ node, editor, getPos }) => {
			let wrapper: HTMLElement | undefined
			let snapZoneActive = false
			let pendingWidth: number | null = pixelWidth(node.attrs.width)
			let snapAnimation: Animation | undefined
			const target = document.createElement('div')
			target.className = 'markdown-image-snap-target'
			target.setAttribute('aria-hidden', 'true')
			target.hidden = true
			const image = document.createElement('img')
			image.draggable = false
			image.style.maxWidth = '100%'
			image.style.display = 'block'
			/**
			 * Synchronize preview attributes after edits, undo, and external updates.
			 * @param updated Updated image node.
			 * @returns Whether the existing view can represent the node.
			 */
			const sync = (updated: ProseMirrorNode) => {
				if (updated.type !== node.type) return false
				const source = isString(updated.attrs.src)
					? imagePreviewUrl(updated.attrs.src)
					: undefined
				if (source) image.setAttribute('src', source)
				else image.removeAttribute('src')
				for (const key of ['alt', 'title']) {
					const value = updated.attrs[key]
					if (isString(value)) image.setAttribute(key, value)
					else image.removeAttribute(key)
				}
				const width = pixelWidth(updated.attrs.width)
				pendingWidth = width
				image.style.width = '100%'
				if (wrapper) wrapper.style.width = width === null ? '100%' : `${width}px`
				image.style.height = 'auto'
				return true
			}
			sync(node)
			const view = new ResizableNodeView({
				element: image,
				node,
				editor,
				getPos,
				onUpdate: sync,
				/**
				 * Keep natural proportions and constrain the live image to its container.
				 * @param width Current preferred width.
				 * @returns Nothing.
				 */
				onResize: (width) => {
					const available = view.container.clientWidth
					snapZoneActive =
						available > 0 && width >= available - (snapZoneActive ? 20 : 12)
					const preferred = available > 0 ? Math.min(width, available) : width
					pendingWidth = pixelWidth(preferred)
					snapAnimation?.cancel()
					snapAnimation = undefined
					if (wrapper) wrapper.style.width = `${preferred}px`
					target.hidden = !snapZoneActive
					const ratio =
						image.naturalWidth > 0
							? image.naturalHeight / image.naturalWidth
							: image.offsetWidth > 0
								? image.offsetHeight / image.offsetWidth
								: 0
					target.style.height = `${available * ratio}px`
					image.style.width = '100%'
					image.style.height = 'auto'
				},
				/**
				 * Commit the visible pixel width without retaining a height.
				 * @returns Nothing.
				 */
				onCommit: () => {
					const position = getPos()
					if (position === undefined || !editor.isEditable) return
					const shouldSnap = snapZoneActive
					const previous = wrapper?.getBoundingClientRect().width ?? 0
					const available = view.container.clientWidth
					target.hidden = true
					snapZoneActive = false
					editor
						.chain()
						.setNodeSelection(position)
						.updateAttributes(this.name, {
							width: shouldSnap ? null : pendingWidth,
							height: null,
						})
						.run()
					if (shouldSnap && wrapper) {
						wrapper.style.width = '100%'
						if (
							!window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
							typeof wrapper.animate === 'function'
						) {
							snapAnimation = wrapper.animate(
								[{ width: `${previous}px` }, { width: `${available}px` }],
								{ duration: 140, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
							)
						}
					}
				},
				options: {
					directions: ['right'],
					preserveAspectRatio: true,
					className: {
						container: 'markdown-image-resize',
						handle: 'markdown-image-resize-handle',
					},
				},
			})
			wrapper = view.wrapper
			wrapper.style.maxWidth = '100%'
			view.container.style.maxWidth = '100%'
			view.container.style.position = 'relative'
			view.container.appendChild(target)
			sync(node)
			const destroy = view.destroy.bind(view)
			/**
			 * Cancel an in-flight snap when the image leaves the document.
			 * @returns Nothing.
			 */
			view.destroy = () => {
				snapAnimation?.cancel()
				destroy()
			}
			return view
		}
	},
}).configure({ allowBase64: false })
