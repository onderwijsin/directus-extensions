import { z } from 'zod'

const PropSchema = z.looseObject({
	name: z.string().min(1).optional(),
	type: z.string().optional(),
	description: z.string().optional(),
	required: z.boolean().optional(),
	default: z.unknown().optional(),
	values: z.array(z.string()).optional(),
})

const ComponentSchema = z.looseObject({
	name: z.string().min(1),
	label: z.string().optional(),
	description: z.string().optional(),
	props: z.union([z.record(z.string(), PropSchema), z.array(PropSchema)]).optional(),
	slots: z
		.union([z.array(z.string()), z.array(z.looseObject({ name: z.string().min(1) }))])
		.optional(),
})

const MetadataResponseSchema = z.union([
	z.array(ComponentSchema),
	z.looseObject({ components: z.array(ComponentSchema) }),
])

export interface ComponentMetadata {
	name: string
	label: string
	description?: string
	props: Record<string, z.infer<typeof PropSchema>>
	slots: string[]
}

/**
 * Validate and normalize the supported component metadata response shapes.
 * @param payload Untrusted metadata response.
 * @returns Normalized component metadata.
 */
export function normalizeComponentMetadata(payload: unknown): ComponentMetadata[] {
	const result = MetadataResponseSchema.safeParse(payload)
	if (!result.success) throw new Error('Component metadata has an unsupported shape.')
	const components = Array.isArray(result.data) ? result.data : result.data.components
	return components.map((component) => ({
		name: component.name,
		label: component.label ?? component.name,
		description: component.description,
		props: Array.isArray(component.props)
			? Object.fromEntries(
					component.props
						.filter((prop): prop is typeof prop & { name: string } =>
							Boolean(prop.name),
						)
						.map((prop) => [prop.name, prop]),
				)
			: (component.props ?? {}),
		slots: component.slots?.map((slot) => (typeof slot === 'string' ? slot : slot.name)) ?? [],
	}))
}
