import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { ReferenceApiClient } from './api'
import type {
	ReferenceProps,
	ReferenceSnapshotMode,
	ResolvedReferenceCollectionConfig,
} from './schema'

import { resolveReferences } from './api'
import { isReferenceSnapshotCurrent, parseReferenceProps } from './schema'

export interface ReferenceBookmark {
	from: number
	to: number
}

export type ReferenceIntegrityState =
	| 'valid'
	| 'archived'
	| 'malformed'
	| 'unconfigured'
	| 'not_available'
	| 'outdated'
	| 'verification_error'

export type ReferenceSourceState =
	| 'available'
	| 'archived'
	| 'unavailable'
	| 'unconfigured'
	| 'malformed'
	| 'error'
export type ReferenceSnapshotState = 'current' | 'outdated' | 'unchecked'

export interface ReferenceOccurrence {
	key: string
	position: number
	rawProps: unknown
	reference?: ReferenceProps
	state: ReferenceIntegrityState
	sourceState: ReferenceSourceState
	snapshotState: ReferenceSnapshotState
	current?: ReferenceProps
}

/**
 * Capture a selection that can safely be restored after a Studio overlay takes focus.
 * @param editor Active editor.
 * @returns Current selection bookmark.
 */
export function selectionBookmark(editor: Editor): ReferenceBookmark {
	return { from: editor.state.selection.from, to: editor.state.selection.to }
}

/**
 * Clamp a captured selection to the current document.
 * @param editor Active editor.
 * @param bookmark Captured selection.
 * @returns Safe current selection.
 */
function clampedBookmark(editor: Editor, bookmark: ReferenceBookmark): ReferenceBookmark {
	const maximum = editor.state.doc.content.size
	const from = Math.max(0, Math.min(bookmark.from, maximum))
	const to = Math.max(from, Math.min(bookmark.to, maximum))
	return { from, to }
}

/**
 * Insert a canonical Reference through the existing generic inline MDC node.
 * @param editor Active editor.
 * @param reference Canonical reference.
 * @param bookmark Captured insertion selection.
 * @returns Whether insertion succeeded.
 */
export function insertReference(
	editor: Editor,
	reference: ReferenceProps,
	bookmark: ReferenceBookmark,
): boolean {
	return editor
		.chain()
		.focus()
		.setTextSelection(clampedBookmark(editor, bookmark))
		.insertContent({ type: 'mdcInline', attrs: { name: 'Reference', props: reference } })
		.run()
}

/**
 * Update one Reference occurrence without relying on the current overlay selection.
 * @param editor Active editor.
 * @param position Reference node position.
 * @param reference Replacement properties.
 * @returns Whether the targeted node was updated.
 */
export function updateReferenceAt(
	editor: Editor,
	position: number,
	reference: ReferenceProps,
): boolean {
	const node = editor.state.doc.nodeAt(position)
	if (node?.type.name !== 'mdcInline' || node.attrs.name !== 'Reference') return false
	const transaction = editor.state.tr.setNodeMarkup(position, undefined, {
		...node.attrs,
		props: reference,
	})
	editor.view.dispatch(transaction)
	return true
}

/**
 * Remove one exact Reference occurrence.
 * @param editor Active editor.
 * @param position Reference node position.
 * @returns Whether the targeted node was removed.
 */
export function removeReferenceAt(editor: Editor, position: number): boolean {
	const node = editor.state.doc.nodeAt(position)
	if (node?.type.name !== 'mdcInline' || node.attrs.name !== 'Reference') return false
	editor.view.dispatch(editor.state.tr.delete(position, position + node.nodeSize))
	return true
}

/**
 * Collect all Reference atoms while retaining malformed raw props and occurrence positions.
 * @param document ProseMirror document.
 * @returns Occurrence-oriented References.
 */
export function collectReferenceOccurrences(document: ProseMirrorNode): ReferenceOccurrence[] {
	const occurrences: ReferenceOccurrence[] = []
	document.descendants((node, position) => {
		if (node.type.name !== 'mdcInline' || node.attrs.name !== 'Reference') return
		const parsed = parseReferenceProps(node.attrs.props)
		occurrences.push({
			key: `${position}:${occurrences.length}`,
			position,
			rawProps: node.attrs.props,
			reference: parsed.success ? parsed.data : undefined,
			state: parsed.success ? 'valid' : 'malformed',
			sourceState: parsed.success ? 'available' : 'malformed',
			snapshotState: 'unchecked',
		})
	})
	return occurrences
}

export interface ReferenceScanResult {
	occurrences: ReferenceOccurrence[]
	synchronized: number
}

/**
 * Resolve all references once per document and optionally synchronize source-owned snapshots.
 * @param editor Active editor.
 * @param api Authenticated Studio API client.
 * @param collections Resolved collection configuration.
 * @param mode Snapshot freshness mode.
 * @param signal Optional cancellation signal.
 * @returns Occurrence states and synchronization count.
 */
export async function scanReferences(
	editor: Editor,
	api: ReferenceApiClient,
	collections: ResolvedReferenceCollectionConfig[],
	mode: ReferenceSnapshotMode,
	signal?: AbortSignal,
): Promise<ReferenceScanResult> {
	const occurrences = collectReferenceOccurrences(editor.state.doc)
	const configured = new Map(collections.map((collection) => [collection.collection, collection]))
	for (const occurrence of occurrences) {
		if (occurrence.reference && !configured.has(occurrence.reference.collection)) {
			occurrence.state = 'unconfigured'
			occurrence.sourceState = 'unconfigured'
		}
	}

	for (const config of collections) {
		const relevant = occurrences.filter(
			(occurrence) => occurrence.reference?.collection === config.collection,
		)
		const uniqueItems = new Map<string, string | number>()
		for (const occurrence of relevant) {
			if (occurrence.reference && !uniqueItems.has(String(occurrence.reference.item))) {
				uniqueItems.set(String(occurrence.reference.item), occurrence.reference.item)
			}
		}
		const items = [...uniqueItems.values()]
		if (!items.length) continue
		const resolution = await resolveReferences(api, config, items, signal)
		for (const occurrence of relevant) {
			if (!occurrence.reference) continue
			const itemKey = String(occurrence.reference.item)
			if (resolution.verificationErrorItems.has(itemKey)) {
				occurrence.state = 'verification_error'
				occurrence.sourceState = 'error'
				continue
			}
			if (resolution.unavailableItems.has(itemKey)) {
				occurrence.state = 'not_available'
				occurrence.sourceState = 'unavailable'
				continue
			}
			const current = resolution.items.get(itemKey)
			if (!current) {
				occurrence.state = 'not_available'
				occurrence.sourceState = 'unavailable'
				continue
			}
			occurrence.current = current
			occurrence.sourceState = resolution.archivedItems.has(itemKey)
				? 'archived'
				: 'available'
			occurrence.snapshotState =
				mode === 'snapshot'
					? 'unchecked'
					: isReferenceSnapshotCurrent(occurrence.reference, current)
						? 'current'
						: 'outdated'
			occurrence.state =
				occurrence.sourceState === 'archived'
					? 'archived'
					: occurrence.snapshotState === 'outdated'
						? 'outdated'
						: 'valid'
		}
	}

	const stale = mode === 'sync' ? occurrences.filter((entry) => entry.state === 'outdated') : []
	let synchronized = 0
	if (stale.length) {
		let transaction = editor.state.tr
		for (const occurrence of [...stale].sort((left, right) => right.position - left.position)) {
			if (!occurrence.reference || !occurrence.current) continue
			const node = transaction.doc.nodeAt(occurrence.position)
			if (node?.type.name !== 'mdcInline' || node.attrs.name !== 'Reference') continue
			transaction = transaction.setNodeMarkup(occurrence.position, undefined, {
				...node.attrs,
				props: {
					...occurrence.reference,
					label: occurrence.current.label,
					data: occurrence.current.data,
				},
			})
			occurrence.state = 'valid'
			synchronized += 1
		}
		if (transaction.docChanged) editor.view.dispatch(transaction)
	}
	return { occurrences, synchronized }
}
