import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { ComponentMetadata, ComponentProp } from './schema'

import { isArray, isRecord, isString, keys } from '@onderwijsin/directus-extension-utils'

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
	return (
		value === undefined ||
		value === null ||
		value === '' ||
		(isArray(value) && value.length === 0)
	)
}

/**
 * Collect nested required and removed property paths without changing persisted values.
 * @param definitions Current property metadata.
 * @param values Persisted property values.
 * @param prefix Parent property path.
 * @returns Missing, empty, and removed paths.
 */
function propertyDrift(
	definitions: Record<string, ComponentProp>,
	values: Record<string, unknown>,
	prefix = '',
) {
	const missing: string[] = []
	const empty: string[] = []
	const removed: string[] = []
	for (const name of keys(values)) {
		if (!Object.hasOwn(definitions, name)) removed.push(`${prefix}${name}`)
	}
	for (const [name, definition] of Object.entries(definitions)) {
		const path = `${prefix}${name}`
		if (!Object.hasOwn(values, name)) {
			if (definition.required) missing.push(path)
			continue
		}
		const value = values[name]
		if (definition.required && isRequiredComponentPropEmpty(value)) {
			empty.push(path)
			continue
		}
		if (definition.type === 'object' && isRecord(value)) {
			const nested = propertyDrift(definition.properties ?? {}, value, `${path}.`)
			missing.push(...nested.missing)
			empty.push(...nested.empty)
			removed.push(...nested.removed)
		}
		if (definition.type === 'array' && isArray(value) && definition.items?.type === 'object') {
			for (const [index, row] of value.entries()) {
				if (!isRecord(row)) continue
				const nested = propertyDrift(
					definition.items.properties ?? {},
					row,
					`${path}.${index}.`,
				)
				missing.push(...nested.missing)
				empty.push(...nested.empty)
				removed.push(...nested.removed)
			}
		}
	}
	return { missing, empty, removed }
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
		const drift = propertyDrift(component.props, storedProps)
		const missingProps = drift.missing
		const emptyRequiredProps = drift.empty
		const removedProps = drift.removed
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
