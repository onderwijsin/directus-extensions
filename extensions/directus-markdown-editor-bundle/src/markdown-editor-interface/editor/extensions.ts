import type { EditorSkillMenuItem } from '../ai/types'
import type { ComponentMetadata } from '../component-meta/schema'

import Image from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

import { PendingAiSuggestionExtension } from '../ai/pending'
import { MdcBlock, MdcInline, MdcSlot } from '../markdown'
import { Video } from '../markdown/video'
import { MarkdownCodeBlock } from './code-block'
import { isEditorToolEnabled } from './commands'
import { ClearMarksOnEnter } from './enter'
import { Placeholder } from './placeholder'
import { createReferenceTrigger } from './reference-trigger'
import { createConfiguredShortcutGuard } from './shortcuts'
import { createSlashExtension } from './slash'

/** Actions delegated by editor extensions to the surrounding interface. */
export interface EditorExtensionActions {
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
		PendingAiSuggestionExtension,
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
		Image.configure({ allowBase64: false }),
		Video,
		MarkdownCodeBlock.configure({ enableTabIndentation: true }),
		MdcBlock,
		MdcInline,
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
