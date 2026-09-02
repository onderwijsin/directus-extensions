import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

import { MdcBlock, MdcInline, MdcSlot } from '../markdown'

/** The deliberately small POC extension set; Markdown remains the storage boundary.
 * @returns Tiptap extensions used by the interface. */
export function createEditorExtensions() {
	return [
		StarterKit,
		Table.configure({ resizable: false }),
		TableRow,
		TableHeader,
		TableCell,
		MdcBlock,
		MdcInline,
		MdcSlot,
		Markdown,
	]
}
