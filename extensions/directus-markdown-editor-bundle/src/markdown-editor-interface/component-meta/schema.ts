import { fromEntries, isString, isArray, isRecord } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

const PropFields = z.looseObject({
	name: z.string().min(1).optional(),
	type: z.string().optional(),
	description: z.string().optional(),
	required: z.boolean().optional(),
	default: z.unknown().optional(),
	values: z.array(z.string()).optional(),
	tags: z
		.array(
			z.looseObject({
				name: z.string().min(1),
				text: z.string().optional(),
				config: z.unknown().optional(),
			}),
		)
		.optional(),
})

type RecursiveProp = z.infer<typeof PropFields> & {
	properties?: Record<string, RecursiveProp>
	items?: RecursiveProp
}

const PropSchema: z.ZodType<RecursiveProp> = z.looseObject({
	...PropFields.shape,
	/** @returns Recursive child property definitions. */
	get properties() {
		return z.record(z.string(), PropSchema).optional()
	},
	/** @returns Recursive array item definition. */
	get items() {
		return PropSchema.optional()
	},
})

export type ComponentProp = z.infer<typeof PropSchema>

const ComponentSchema = z.looseObject({
	name: z.string().min(1),
	label: z.string().optional(),
	description: z.string().optional(),
	tags: z
		.array(
			z.looseObject({
				name: z.string().min(1),
				text: z.string().optional(),
				config: z.unknown().optional(),
			}),
		)
		.optional(),
	nodeType: z.enum(['block', 'inline']),
	props: z.preprocess(
		(value) =>
			isArray(value)
				? fromEntries(
						value
							.filter(isRecord)
							.filter((item): item is Record<string, unknown> & { name: string } =>
								isString(item.name),
							)
							.map((item) => [item.name, item]),
					)
				: value,
		z.record(z.string(), PropSchema).optional(),
	),
	slots: z
		.union([z.array(z.string()), z.array(z.looseObject({ name: z.string().min(1) }))])
		.optional(),
})

const ComponentListSchema = z.array(ComponentSchema)
const MetadataResponseSchema = z.looseObject({ components: ComponentListSchema })

export interface ComponentMetadata {
	name: string
	label: string
	description?: string
	tags?: { name: string; text?: string; config?: unknown }[]
	nodeType: 'block' | 'inline'
	props: Record<string, ComponentProp>
	slots: string[]
}

interface TaggedMetadata {
	tags?: { name: string; text?: string; config?: unknown }[]
}

/**
 * Resolve the standard deprecation tag supplied by Vue component metadata.
 * @param prop Normalized component property metadata.
 * @returns The deprecation tag when present.
 */
export function componentPropDeprecation(prop: ComponentProp) {
	return metadataDeprecation(prop)
}

/**
 * Resolve the optional special input hint supplied through Vue-compatible JSDoc tags.
 * The older editor tag remains readable for existing component metadata.
 * @param prop Normalized component property metadata.
 * @returns The normalized editor control name when present.
 */
export function componentPropSpecialInputType(prop: ComponentProp) {
	return (
		prop.tags?.find((tag) => tag.name === 'specialInputType') ??
		prop.tags?.find((tag) => tag.name === 'editor')
	)?.text
		?.trim()
		.toLowerCase()
}

/**
 * Resolve the standard deprecation tag supplied by Vue component metadata.
 * @param metadata Component or property metadata.
 * @returns The deprecation tag when present.
 */
export function metadataDeprecation(metadata: TaggedMetadata) {
	return metadata.tags?.find((tag) => tag.name === 'deprecated')
}

/**
 * Validates and normalizes component metadata supplied by a project or URL.
 * @param payload Unknown metadata response to validate.
 * @returns Metadata with stable labels, prop maps, and slot names.
 * @throws {Error} When the payload does not match the supported metadata shape.
 */
export function normalizeComponentMetadata(payload: unknown): ComponentMetadata[] {
	const result = (isArray(payload) ? ComponentListSchema : MetadataResponseSchema).safeParse(
		payload,
	)
	if (!result.success) {
		throw new Error(
			`Component metadata has an unsupported shape.\n${z.prettifyError(result.error)}`,
		)
	}
	const components = (isArray(result.data) ? result.data : result.data.components).filter(
		(component) => component.name !== 'Reference',
	)
	return components.map(
		/**
		 * Editor callback.
		 * @param component Parameter value.
		 * @returns Callback result.
		 */
		(component) => ({
			name: component.name,
			label: component.label ?? component.name,
			description: component.description,
			tags: component.tags,
			nodeType: component.nodeType,
			props: component.props ?? {},
			slots:
				component.slots?.map(
					/**
					 * Editor callback.
					 * @param slot Parameter value.
					 * @returns Callback result.
					 */
					(slot) => (isString(slot) ? slot : slot.name),
				) ?? [],
		}),
	)
}
