import type { ComponentProp } from './schema'

import { isRecord, toEntries } from '@onderwijsin/directus-extension-utils'

import { linkValueError } from '../editor/link'
import { isRequiredComponentPropEmpty } from './freshness'
import { componentPropSpecialInputType } from './schema'

/**
 * Create a draft value for a property, retaining author defaults.
 * @param definition Property metadata.
 * @returns Initial draft value.
 */
export function createPropertyDraft(definition: ComponentProp): unknown {
	if (definition.default !== undefined) return structuredClone(definition.default)
	if (definition.type === 'boolean') return false
	if (definition.type === 'array') return []
	if (definition.type === 'object')
		return definition.required ? createObjectDraft(definition) : undefined
	return ''
}

/**
 * Create a draft object with defined child defaults and editable required children.
 * @param definition Object property metadata.
 * @returns Initial child values.
 */
export function createObjectDraft(definition: ComponentProp): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const [name, child] of toEntries(definition.properties ?? {})) {
		if (child.default !== undefined || child.required) result[name] = createPropertyDraft(child)
	}
	return result
}

/**
 * Reconcile a property value with current nested metadata during explicit refresh.
 * @param definition Current property metadata.
 * @param previous Persisted or drafted value.
 * @returns Value without obsolete nested keys.
 */
export function refreshPropertyDraft(definition: ComponentProp, previous: unknown): unknown {
	if (previous === undefined) return createPropertyDraft(definition)
	if (definition.type === 'object' && isRecord(previous)) {
		const result: Record<string, unknown> = {}
		for (const [name, child] of toEntries(definition.properties ?? {})) {
			if (Object.hasOwn(previous, name) || child.default !== undefined || child.required) {
				result[name] = refreshPropertyDraft(child, previous[name])
			}
		}
		return result
	}
	if (
		definition.type === 'array' &&
		Array.isArray(previous) &&
		definition.items?.type === 'object'
	) {
		return previous.map((row) => refreshPropertyDraft(definition.items ?? {}, row))
	}
	return previous
}

/**
 * Return every invalid property path for the current draft, including repeater rows.
 * @param definitions Current property metadata.
 * @param values Draft values.
 * @returns Error messages keyed by property path.
 */
export function validatePropertyDrafts(
	definitions: Record<string, ComponentProp>,
	values: Record<string, unknown>,
): Record<string, string> {
	const errors: Record<string, string> = {}
	for (const [name, definition] of toEntries(definitions)) {
		validateProperty(definition, values[name], name, errors)
	}
	return errors
}

/**
 * Validate a property and its reachable descendants.
 * @param definition Current property metadata.
 * @param value Draft value.
 * @param path Current property path.
 * @param errors Mutable error collection.
 * @returns Nothing.
 */
function validateProperty(
	definition: ComponentProp,
	value: unknown,
	path: string,
	errors: Record<string, string>,
) {
	if (
		definition.required &&
		(isRequiredComponentPropEmpty(value) || (definition.type === 'object' && !isRecord(value)))
	) {
		errors[path] = 'This field is required.'
		return
	}
	if (value !== undefined && value !== null && definition.type === 'object' && !isRecord(value)) {
		errors[path] = 'Expected an object.'
		return
	}
	if (
		value !== undefined &&
		value !== null &&
		definition.type === 'array' &&
		!Array.isArray(value)
	) {
		errors[path] = 'Expected an array.'
		return
	}
	if (
		definition.type === 'string' &&
		componentPropSpecialInputType(definition) === 'url' &&
		typeof value === 'string' &&
		value.trim()
	) {
		const error = linkValueError('url', value.trim())
		if (error) errors[path] = error
	}
	if (definition.type === 'object' && isRecord(value)) {
		for (const [name, child] of toEntries(definition.properties ?? {})) {
			validateProperty(child, value[name], `${path}.${name}`, errors)
		}
	}
	const item = definition.items
	if (definition.type === 'array' && Array.isArray(value)) {
		if (item?.type === 'object' && value.some((row) => !isRecord(row))) {
			errors[path] = 'Each item must be an object.'
			return
		}
		if (item?.type !== 'object' && value.some((row) => typeof row !== 'string')) {
			errors[path] = 'Each item must be a string.'
			return
		}
	}
	if (definition.type === 'array' && Array.isArray(value) && item?.type === 'object') {
		value.forEach((row, index) => validateProperty(item, row, `${path}.${index}`, errors))
	}
}

/**
 * Whether any nested property uses the Directus image picker.
 * @param definitions Property metadata.
 * @returns Whether an image field exists.
 */
export function hasImageProperty(definitions: Record<string, ComponentProp>): boolean {
	return Object.values(definitions).some((definition) => {
		if (definition.type === 'string' && componentPropSpecialInputType(definition) === 'image')
			return true
		if (definition.type === 'object') return hasImageProperty(definition.properties ?? {})
		if (definition.type === 'array' && definition.items?.type === 'object')
			return hasImageProperty(definition.items.properties ?? {})
		return false
	})
}
