import { Extension } from '@tiptap/core'

import { isEditorToolEnabled } from './commands'

const toolShortcuts: Record<string, string[]> = {
	paragraph: ['Mod-Alt-0'],
	'heading-1': ['Mod-Alt-1'],
	'heading-2': ['Mod-Alt-2'],
	'heading-3': ['Mod-Alt-3'],
	'heading-4': ['Mod-Alt-4'],
	'heading-5': ['Mod-Alt-5'],
	'heading-6': ['Mod-Alt-6'],
	bold: ['Mod-b', 'Mod-B'],
	italic: ['Mod-i', 'Mod-I'],
	strike: ['Mod-Shift-s'],
	code: ['Mod-e'],
	blockquote: ['Mod-Shift-b'],
	'code-block': ['Mod-Alt-c'],
	'bullet-list': ['Mod-Shift-8'],
	'ordered-list': ['Mod-Shift-7'],
	'hard-break': ['Mod-Enter', 'Shift-Enter'],
	history: ['Mod-z', 'Mod-y', 'Shift-Mod-z'],
}

/**
 * Consume native Tiptap shortcuts whose corresponding interface tool is disabled.
 * @param getEnabledTools Resolve the current interface tool selection.
 * @returns A high-priority shortcut guard extension.
 */
export function createConfiguredShortcutGuard(
	getEnabledTools: () => readonly string[] | null | undefined,
) {
	return Extension.create({
		name: 'configuredShortcutGuard',
		priority: 1000,

		/** @returns Shortcut handlers that defer to Tiptap only for enabled tools. */
		addKeyboardShortcuts() {
			return Object.fromEntries(
				Object.entries(toolShortcuts).flatMap(([toolId, shortcuts]) =>
					shortcuts.map((shortcut) => [
						shortcut,
						() => !isEditorToolEnabled(getEnabledTools(), toolId),
					]),
				),
			)
		},
	})
}
