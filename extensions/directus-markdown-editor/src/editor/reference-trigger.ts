import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

interface Candidate {
	position: number
}

const referenceTriggerKey = new PluginKey<Candidate | null>('referenceTrigger')

/**
 * Create the bare-@ then Enter trigger used by Reference insertion.
 * @param open Opens the shared picker at the consumed trigger position.
 * @param isEnabled Resolves the current insertion capability.
 * @returns A Tiptap extension.
 */
export function createReferenceTrigger(open: (position: number) => void, isEnabled: () => boolean) {
	return Extension.create({
		name: 'referenceTrigger',
		/**
		 * Build the trigger-state plugin.
		 * @returns ProseMirror plugins.
		 */
		addProseMirrorPlugins: () => [
			new Plugin<Candidate | null>({
				key: referenceTriggerKey,
				state: {
					/**
					 * Initialize without an active trigger.
					 * @returns Empty trigger state.
					 */
					init: () => null,
					/**
					 * Advance trigger state for a transaction.
					 * @param transaction Current transaction.
					 * @param previous Previous trigger state.
					 * @returns Next trigger state.
					 */
					apply(transaction, previous) {
						if (!isEnabled()) return null
						const cleared = transaction.getMeta(referenceTriggerKey)
						if (cleared === 'clear') return null
						if (previous && transaction.selectionSet) {
							const mapped = transaction.mapping.map(previous.position)
							return transaction.selection.empty &&
								transaction.selection.from === mapped + 1
								? { position: mapped }
								: null
						}
						if (!transaction.docChanged) return previous
						if (previous) return null
						const selection = transaction.selection
						if (!selection.empty || selection.from < 1) return null
						const position = selection.from - 1
						if (transaction.doc.textBetween(position, selection.from) !== '@')
							return null
						const $position = transaction.doc.resolve(position)
						if ($position.parent.type.name === 'codeBlock') return null
						const previousCharacter =
							position === $position.start()
								? ''
								: transaction.doc.textBetween(position - 1, position)
						return previousCharacter === '' || /\s/u.test(previousCharacter)
							? { position }
							: null
					},
				},
				props: {
					/**
					 * Decorate the active bare trigger.
					 * @param state Current editor state.
					 * @returns Trigger decoration set.
					 */
					decorations(state) {
						const candidate = referenceTriggerKey.getState(state)
						return candidate
							? DecorationSet.create(state.doc, [
									Decoration.inline(candidate.position, candidate.position + 1, {
										class: 'reference-trigger',
										'data-reference-trigger': '',
									}),
									Decoration.widget(
										candidate.position + 1,
										() => {
											const hint = document.createElement('span')
											hint.className = 'reference-trigger__hint'
											hint.textContent = 'Hit enter to mention a record'
											hint.contentEditable = 'false'
											hint.setAttribute('aria-hidden', 'true')
											return hint
										},
										{ key: 'reference-trigger-hint', side: 1 },
									),
								])
							: DecorationSet.empty
					},
					/**
					 * Consume Enter or cancel an active trigger.
					 * @param view Current editor view.
					 * @param event Keyboard event.
					 * @returns Whether the event was handled.
					 */
					handleKeyDown(view, event) {
						const candidate = referenceTriggerKey.getState(view.state)
						if (!candidate) return false
						if (event.key === 'Escape') {
							view.dispatch(view.state.tr.setMeta(referenceTriggerKey, 'clear'))
							return true
						}
						if (event.key !== 'Enter') return false
						const transaction = view.state.tr
							.delete(candidate.position, candidate.position + 1)
							.setMeta(referenceTriggerKey, 'clear')
						view.dispatch(transaction)
						open(candidate.position)
						return true
					},
				},
			}),
		],
	})
}
