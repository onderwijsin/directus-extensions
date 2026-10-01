import type { EditorSkillMenuItem } from '../ai/types'
import type { ComponentMetadata } from '../component-meta/schema'

import { isString } from '@onderwijsin/directus-extension-utils'
import Image from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

import { MdcBlock, MdcInline, MdcSlot } from '../markdown'
import { Video } from '../markdown/video'
import { MarkdownCodeBlock } from './code-block'
import { isEditorToolEnabled } from './commands'
import { ClearMarksOnEnter } from './enter'
import { imagePreviewUrl } from './media'
import { Placeholder } from './placeholder'
import { createReferenceTrigger } from './reference-trigger'
import { createConfiguredShortcutGuard } from './shortcuts'
import { createSlashExtension } from './slash'

/** Actions delegated by editor extensions to the surrounding interface. */
export interface EditorExtensionActions {
	openLink?: () => void
	openImage?: () => void
	openVideo?: () => void
	openComponent?: (component: ComponentMetadata) => void
	openReference?: (position: number) => void
	canOpenReference?: () => boolean
	openAiInsert?: (skillId?: string) => void
	getAiSkills?: () => EditorSkillMenuItem[]
	canOpenAi?: () => boolean
}

/**
 * Editor callback.
 * @param getComponents Resolves the configured MDC components.
 * @param actions Actions that open interface-owned insertion flows.
 * @param getEnabledTools Resolves the configured editor tools.
 * @returns Callback result.
 */
export function createEditorExtensions(
	getComponents: () => ComponentMetadata[] = () => [],
	actions: EditorExtensionActions = {},
	getEnabledTools: () => readonly string[] | null | undefined = () => undefined,
) {
	return [
		createConfiguredShortcutGuard(getEnabledTools),
		StarterKit.configure({ codeBlock: false }),
		ClearMarksOnEnter,
		Table.configure({
			resizable: true,
			cellMinWidth: 80,
			lastColumnResizable: true,
			allowTableNodeSelection: true,
		}),
		TableRow,
		TableHeader,
		TableCell,
		Image.extend({
			/**
			 * Render bare asset IDs as local images while retaining the ID in Markdown.
			 * @param context Tiptap render context.
			 * @returns Rendered image specification.
			 */
			renderHTML(context) {
				const attributes = context.HTMLAttributes
				const source = attributes.src
				return [
					'img',
					{
						...attributes,
						src: isString(source) ? imagePreviewUrl(source) : undefined,
					},
				]
			},
		}).configure({ allowBase64: false }),
		Video,
		MarkdownCodeBlock.configure({ enableTabIndentation: true }),
		MdcBlock.configure({
			/**
			 * Resolve the editor-facing label for a serialized component name.
			 * @param name Serialized component name.
			 * @returns Editor-facing component label.
			 */
			getComponentLabel: (name: string) =>
				getComponents().find((component) => component.name === name)?.label ?? name,
		}),
		MdcInline.configure({
			/**
			 * Resolve the editor-facing label for a serialized component name.
			 * @param name Serialized component name.
			 * @returns Editor-facing component label.
			 */
			getComponentLabel: (name: string) =>
				getComponents().find((component) => component.name === name)?.label ?? name,
		}),
		MdcSlot,
		Placeholder.configure({
			placeholder: "Start writing or type '/' for commands",
			nestedPlaceholder: 'Start writing…',
		}),
		...(actions.openReference
			? [
					createReferenceTrigger(
						actions.openReference,
						() =>
							isEditorToolEnabled(getEnabledTools(), 'reference') &&
							(actions.canOpenReference?.() ?? true),
					),
				]
			: []),
		createSlashExtension(getComponents, actions, getEnabledTools),
		Markdown,
	]
}
