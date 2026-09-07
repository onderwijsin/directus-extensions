import type { ComponentMetadata } from '../component-meta/schema'

import Image from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

import { MdcBlock, MdcInline, MdcSlot } from '../markdown'
import { Video } from '../markdown/video'
import { MarkdownCodeBlock } from './code-block'
import { ClearMarksOnEnter } from './enter'
import { Placeholder } from './placeholder'
import { createSlashExtension } from './slash'

/** Actions delegated by editor extensions to the surrounding interface. */
export interface EditorExtensionActions {
	openImage?: () => void
	openVideo?: () => void
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
		Image.configure({ allowBase64: false }),
		Video,
		MarkdownCodeBlock.configure({ enableTabIndentation: true }),
		MdcBlock,
		MdcInline,
		MdcSlot,
		Placeholder.configure({
			placeholder: 'Start writing…',
		}),
		createSlashExtension(getComponents, actions, getEnabledTools),
		Markdown,
	]
}
