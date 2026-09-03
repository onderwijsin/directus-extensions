import type { ComponentMetadata } from '../component-meta/schema'

import Image from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

import { MdcBlock, MdcInline, MdcSlot } from '../markdown'
import { Video } from '../markdown/video'
import { ClearMarksOnEnter } from './enter'
import { Placeholder } from './placeholder'
import { createSlashExtension } from './slash'

/**
 * Editor callback.
 * @param getComponents Parameter value.
 * @returns Callback result.
 */
export function createEditorExtensions(
	getComponents: () => ComponentMetadata[] /**
	 * Editor callback.
	 * @returns Callback result.
	 */ = () => [],
) {
	return [
		StarterKit,
		ClearMarksOnEnter,
		Table.configure({ resizable: false }),
		TableRow,
		TableHeader,
		TableCell,
		Image.configure({ allowBase64: false }),
		Video,
		MdcBlock,
		MdcInline,
		MdcSlot,
		Placeholder.configure({
			placeholder: 'Start writing…',
		}),
		createSlashExtension(getComponents),
		Markdown,
	]
}
