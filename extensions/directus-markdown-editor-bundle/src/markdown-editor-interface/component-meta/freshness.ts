import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { ComponentMetadata } from './schema'

import { isRecord, isString, keys } from '@onderwijsin/directus-extension-utils'

import { metadataDeprecation } from './schema'

export type ComponentIntegrityState = 'stale' | 'deprecated' | 'missing'

export interface ComponentOccurrence {
	key: string
	position: number
	name: string
	nodeType: 'mdcBlock' | 'mdcInline'
	props: Record<string, unknown>
	state: ComponentIntegrityState
	missingProps: string[]
	emptyRequiredProps: string[]
	removedProps: string[]
	missingSlots: string[]
	removedSlots: string[]
	deprecation?: string
}

/**
 * Determine whether a required component property lacks an editor value.
 * Boolean false and numeric zero remain valid values.
 * @param value Persisted or drafted property value.
 * @returns Whether the value is empty.
 */
export function isRequiredComponentPropEmpty(value: unknown) {
	return value === undefined || value === null || value === ''
}

/**
 * Collect persisted direct-child slot names.
 * @param node Component node to inspect.
 * @returns Persisted slot names.
 */
function componentSlots(node: ProseMirrorNode) {
	const slots: string[] = []
	node.forEach((child) => {
		if (child.type.name === 'mdcSlot' && isString(child.attrs.name))
			slots.push(child.attrs.name)
	})
	return slots
}

/**
 * Find component nodes with metadata drift, deprecation, or missing metadata.
 * Values are deliberately not mutated during this hydration-time scan.
 * @param editor Editor containing hydrated component nodes.
 * @param components Current normalized component metadata.
 * @returns Component occurrences needing editor attention in document order.
 */
export function scanComponentIntegrity(
	editor: Editor,
	components: readonly ComponentMetadata[],
): ComponentOccurrence[] {
	const byName = new Map(components.map((component) => [component.name, component]))
	const occurrences: ComponentOccurrence[] = []
	editor.state.doc.descendants((node, position) => {
		if (node.type.name !== 'mdcBlock' && node.type.name !== 'mdcInline') return
		if (node.attrs.name === 'Reference' || !isString(node.attrs.name)) return
		const storedProps = isRecord(node.attrs.props) ? node.attrs.props : {}
		const component = byName.get(node.attrs.name)
		if (!component) {
			occurrences.push({
				key: `${position}:${node.attrs.name}`,
				position,
				name: node.attrs.name,
				nodeType: node.type.name,
				props: storedProps,
				state: 'missing',
				missingProps: [],
				emptyRequiredProps: [],
				removedProps: [],
				missingSlots: [],
				removedSlots: [],
			})
			return
		}
		const storedSlots = componentSlots(node)
		const missingProps = keys(component.props).filter(
			(name) => component.props[name]?.required === true && !Object.hasOwn(storedProps, name),
		)
		const emptyRequiredProps = keys(component.props).filter(
			(name) =>
				component.props[name]?.required === true &&
				Object.hasOwn(storedProps, name) &&
				isRequiredComponentPropEmpty(storedProps[name]),
		)
		const removedProps = keys(storedProps).filter(
			(name) => !Object.hasOwn(component.props, name),
		)
		const missingSlots = component.slots.filter((name) => !storedSlots.includes(name))
		const removedSlots = storedSlots.filter((name) => !component.slots.includes(name))
		const deprecation = metadataDeprecation(component)
		const stale =
			missingProps.length > 0 ||
			emptyRequiredProps.length > 0 ||
			removedProps.length > 0 ||
			missingSlots.length > 0 ||
			removedSlots.length > 0
		if (!stale && !deprecation) return
		occurrences.push({
			key: `${position}:${node.attrs.name}`,
			position,
			name: node.attrs.name,
			nodeType: node.type.name,
			props: storedProps,
			state: stale ? 'stale' : 'deprecated',
			missingProps,
			emptyRequiredProps,
			removedProps,
			missingSlots,
			removedSlots,
			deprecation: deprecation?.text,
		})
	})
	return occurrences
}
