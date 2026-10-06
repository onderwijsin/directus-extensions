import type { PathTemplateVariable } from '../configuration/path-template.schema'
import type { PermalinkInterfaceOptions } from '../configuration/types'

import { hasKey, isBoolean, isFiniteNumber, isString } from '@onderwijsin/directus-extension-utils'

import { sluggernautValidationError } from '../errors'
import {
	applyTrailingSlash,
	normalizePermalink,
	normalizeSlug,
	resolveEffectiveFieldValue,
} from './normalization'

/** Parsed path literals and variables with their complete source field dependencies. */
export interface CompiledPathTemplate {
	parts: readonly (string | PathTemplateVariable)[]
	dependencies: ReadonlySet<string>
}

/**
 * Parses the scalar subset of Directus field-template syntax without expressions or relations.
 * @param options - Validated generation options.
 * @returns Compiled literals, variables, and source field dependencies.
 */
export function compilePathTemplate(
	options: Pick<PermalinkInterfaceOptions, 'pathTemplate' | 'templateVariables'>,
): CompiledPathTemplate {
	const template = options.pathTemplate
	if (!template || template.trim() !== template)
		throw sluggernautValidationError('A generated permalink requires a path template.')
	const configured = new Map<string, PathTemplateVariable>()
	for (const variable of options.templateVariables ?? []) {
		if (configured.has(variable.name))
			throw sluggernautValidationError('Template variable names must be unique.')
		configured.set(variable.name, variable)
	}
	const parts: (string | PathTemplateVariable)[] = []
	const dependencies = new Set<string>()
	const used = new Set<string>()
	let offset = 0
	for (const match of template.matchAll(/\{\{\s*([\p{L}_][\p{L}\p{N}_$-]*)\s*\}\}/gu)) {
		const name = match[1]
		if (name === undefined) continue
		parts.push(template.slice(offset, match.index))
		const variable = configured.get(name) ?? { name, field: name }
		parts.push(variable)
		dependencies.add(variable.field)
		used.add(name)
		offset = match.index + match[0].length
	}
	parts.push(template.slice(offset))
	if (parts.some((part) => isString(part) && /[{}]/u.test(part)))
		throw sluggernautValidationError('Path templates support only {{field}} placeholders.')
	if ([...configured.keys()].some((name) => !used.has(name)))
		throw sluggernautValidationError('Configured variables must occur in the path template.')
	// Validate literals even when item dependencies are missing at render time.
	normalizePermalink(parts.map((part) => (isString(part) ? part : 'segment')).join(''))
	return { parts, dependencies }
}

/**
 * Resolves, transforms, and validates one variable as a single path segment.
 * @param variable - Compiled variable configuration.
 * @param value - Effective scalar field value.
 * @returns Safe segment text, or null for an incomplete draft.
 */
function renderVariable(variable: PathTemplateVariable, value: unknown): string | null {
	if (value === null || value === undefined || (isString(value) && value.trim() === ''))
		return null
	if (!isString(value) && !isFiniteNumber(value) && !isBoolean(value))
		throw sluggernautValidationError('Path template dependencies must contain scalar values.')
	let segment: string | null = String(value)
	for (const transform of variable.transforms ?? []) {
		if (segment === null) return null
		switch (transform.type) {
			case 'map':
				segment = hasKey(transform.values, segment)
					? (transform.values[segment] ?? null)
					: null
				break
			case 'slugify':
				segment = normalizeSlug(segment)
				break
			case 'lowercase':
				segment = segment.toLowerCase()
				break
		}
	}
	if (segment === null || segment.trim() === '') return null
	// The existing boundary decodes all encoding layers. A decoded slash would escape this segment.
	const path = normalizePermalink(`/segment/${segment}`)
	let decoded = segment
	for (let layer = 0; layer < 8 && /%[0-9a-f]{2}/iu.test(decoded); layer += 1)
		decoded = decodeURIComponent(decoded)
	if (decoded.includes('/') || segment.includes('/') || path === null || /\s/u.test(segment))
		throw sluggernautValidationError(
			'A path template variable must be a single safe path segment.',
		)
	return segment
}

/**
 * Renders a template using payload precedence and the final derived slug values.
 * @param template - Compiled path template.
 * @param payload - Final mutation payload including derived slugs.
 * @param existingItem - Stored values for fields omitted from the payload.
 * @param trailingSlash - Generated path slash policy.
 * @returns A normalized path, or null when a required variable is missing.
 */
export function renderPathTemplate(
	template: CompiledPathTemplate,
	payload: Readonly<Record<string, unknown>>,
	existingItem: Readonly<Record<string, unknown>>,
	trailingSlash: boolean,
): string | null {
	const parts: string[] = []
	for (const part of template.parts) {
		if (isString(part)) {
			parts.push(part)
			continue
		}
		const segment = renderVariable(
			part,
			resolveEffectiveFieldValue(payload, existingItem, part.field),
		)
		if (segment === null) return null
		parts.push(segment)
	}
	return applyTrailingSlash(parts.join(''), trailingSlash)
}
