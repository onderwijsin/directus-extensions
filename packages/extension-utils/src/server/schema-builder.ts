import { z, type ZodType } from 'zod'

const extensionOptionsBuilder = Symbol('extension-options-builder')
const extensionOptionsConfig = Symbol('extension-options-config')
const extensionOptionsOutput = Symbol('extension-options-output')

export type ExtensionOptionsRefinementContext = Pick<z.core.$RefinementCtx, 'addIssue'>

/** Parsed top-level values supplied to explicit shared configuration refinements. */
export type ExtensionOptionsRefinementValues = Readonly<Record<string, unknown>>

interface ExtensionOptionsConfigFragmentDefinition {
	readonly dependencies: readonly ExtensionOptionsConfigFragment<unknown>[]
	readonly name: string
	readonly refine?: (
		options: ExtensionOptionsRefinementValues,
		context: ExtensionOptionsRefinementContext,
	) => void
	readonly shape: ExtensionOptionsShapeBuilder<z.ZodRawShape>
}

interface ExtensionOptionsConfigFragmentOptions {
	readonly dependencies?: readonly ExtensionOptionsConfigFragment<unknown>[]
	readonly name: string
	readonly refine?: (
		options: ExtensionOptionsRefinementValues,
		context: ExtensionOptionsRefinementContext,
	) => void
	readonly shape: ExtensionOptionsShapeBuilder<z.ZodRawShape>
}

/** Structural contract supported for consumer-owned raw options schemas. */
export interface ExtensionOptionsValidator<Output> {
	/** Validates unknown options without requiring this package's exact Zod type identity. */
	safeParse(
		options: unknown,
	): { success: true; data: Output } | { success: false; error: unknown }
}

type ExtensionOptionsConfigIncludes = readonly [
	ExtensionOptionsConfigFragment<unknown>,
	...ExtensionOptionsConfigFragment<unknown>[],
]

interface ExtensionOptionsSchemaComposition {
	readonly extend?: ExtensionOptionsShapeBuilder<z.ZodRawShape>
	readonly include: ExtensionOptionsConfigIncludes
}

type ExtensionOptionsConfigOutput<Config> =
	Config extends ExtensionOptionsConfigFragment<infer Output> ? Output : never

type IncludedExtensionOptionsOutput<
	Includes extends readonly ExtensionOptionsConfigFragment<unknown>[],
> = Includes extends readonly [
	infer Config extends ExtensionOptionsConfigFragment<unknown>,
	...infer Remaining extends readonly ExtensionOptionsConfigFragment<unknown>[],
]
	? ExtensionOptionsConfigOutput<Config> & IncludedExtensionOptionsOutput<Remaining>
	: unknown

/** Builds an extension options schema with the Zod runtime owned by this package. */
export type ExtensionOptionsSchemaBuilder<Schema extends ZodType> = (zod: typeof z) => Schema

/** Builds additional object fields with the Zod runtime owned by this package. */
export type ExtensionOptionsShapeBuilder<Shape extends z.ZodRawShape> = (zod: typeof z) => Shape

/** A package-owned shared configuration fragment accepted by `defineExtensionOptionsSchema`. */
export interface ExtensionOptionsConfigFragment<Output> {
	/** Package-owned fragment metadata used while composing an options definition. */
	readonly [extensionOptionsConfig]: ExtensionOptionsConfigFragmentDefinition
	/** Carries the inferred output type without exposing a runtime value. */
	readonly [extensionOptionsOutput]?: Output
}

/** The output of shared configuration composed with extension-specific fields. */
export type ExtendedExtensionOptionsOutput<Base, Shape extends z.ZodRawShape> = Base &
	z.output<z.ZodObject<Shape>>

/** Opaque extension options schema definition resolved by `validateExtensionOptions`. */
export interface ExtensionOptionsDefinition<Output> {
	/** Package-owned builder retained until the definition is validated. */
	readonly [extensionOptionsBuilder]: ExtensionOptionsSchemaBuilder<ZodType>
	/** Carries the inferred output type without exposing a runtime value. */
	readonly [extensionOptionsOutput]?: Output
}

/**
 * Creates an opaque schema definition with an explicitly selected output type.
 *
 * @param builder - Builds the schema with the package-owned Zod runtime.
 * @returns An opaque schema definition carrying the selected output type.
 */
function createExtensionOptionsDefinition<Output>(
	builder: ExtensionOptionsSchemaBuilder<ZodType>,
): ExtensionOptionsDefinition<Output> {
	return Object.freeze({ [extensionOptionsBuilder]: builder })
}

/**
 * Creates a package-owned shared configuration fragment.
 *
 * @param options - Explicit fragment fields, dependencies, and optional cross-field refinement.
 * @returns A composable fragment with identity-based dependency semantics.
 */
export function createExtensionOptionsConfigFragment<Output>(
	options: ExtensionOptionsConfigFragmentOptions,
): ExtensionOptionsConfigFragment<Output> {
	const dependencies = Object.freeze([...(options.dependencies ?? [])])

	return Object.freeze({
		[extensionOptionsConfig]: Object.freeze({
			dependencies,
			name: options.name,
			refine: options.refine,
			shape: options.shape,
		}),
	})
}

/**
 * Adds fields to a composed shape while rejecting ambiguous option ownership.
 *
 * @param target - Shape receiving the fields.
 * @param owners - Existing top-level option owners.
 * @param source - New top-level fields.
 * @param owner - Fragment or extension callback that declared the fields.
 * @returns Nothing.
 */
function addExtensionOptionsShape(
	target: Record<string, z.core.$ZodType>,
	owners: Map<string, string>,
	source: z.ZodRawShape,
	owner: string,
): void {
	for (const [key, schema] of Object.entries(source)) {
		const existingOwner = owners.get(key)
		if (existingOwner) {
			throw new Error(
				`Duplicate extension option key "${key}" declared by "${existingOwner}" and "${owner}"`,
			)
		}

		owners.set(key, owner)
		target[key] = schema
	}
}

/**
 * Collects one fragment and all transitive dependencies exactly once by object identity.
 *
 * @param fragment - Fragment to collect.
 * @param fragments - Identity set receiving the dependency graph.
 * @returns Nothing.
 */
function collectExtensionOptionsConfigFragments(
	fragment: ExtensionOptionsConfigFragment<unknown>,
	fragments: Set<ExtensionOptionsConfigFragment<unknown>>,
): void {
	if (fragments.has(fragment)) return

	fragments.add(fragment)
	for (const dependency of fragment[extensionOptionsConfig].dependencies) {
		collectExtensionOptionsConfigFragments(dependency, fragments)
	}
}

/**
 * Builds one object schema from declarative shared configuration and extension fields.
 *
 * @param zod - Package-owned Zod runtime.
 * @param composition - Shared fragments and optional extension-specific fields.
 * @returns A coherent object schema with every fragment refinement applied once.
 */
function composeExtensionOptionsSchema(
	zod: typeof z,
	composition: ExtensionOptionsSchemaComposition,
): z.ZodObject {
	const fragmentSet = new Set<ExtensionOptionsConfigFragment<unknown>>()
	for (const fragment of composition.include) {
		collectExtensionOptionsConfigFragments(fragment, fragmentSet)
	}

	const fragments = [...fragmentSet].sort((left, right) =>
		left[extensionOptionsConfig].name.localeCompare(right[extensionOptionsConfig].name),
	)
	const owners = new Map<string, string>()
	const shape: Record<string, z.core.$ZodType> = {}

	for (const fragment of fragments) {
		const definition = fragment[extensionOptionsConfig]
		addExtensionOptionsShape(shape, owners, definition.shape(zod), definition.name)
	}
	if (composition.extend) {
		addExtensionOptionsShape(shape, owners, composition.extend(zod), 'extend')
	}

	return zod.object(shape).superRefine((options, context) => {
		for (const fragment of fragments) {
			fragment[extensionOptionsConfig].refine?.(options, context)
		}
	})
}

/**
 * Defines an extension options schema without exposing its Zod object to consumers.
 *
 * @param builder - Builds the schema with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export function defineExtensionOptionsSchema<const Schema extends ZodType>(
	builder: ExtensionOptionsSchemaBuilder<Schema>,
): ExtensionOptionsDefinition<z.output<Schema>>
/**
 * Defines extension options by composing package-owned shared configuration.
 *
 * @param composition - Declarative shared fragments without extension-specific fields.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export function defineExtensionOptionsSchema<
	const Includes extends ExtensionOptionsConfigIncludes,
>(composition: {
	readonly extend?: never
	readonly include: Includes
}): ExtensionOptionsDefinition<IncludedExtensionOptionsOutput<Includes>>
/**
 * Defines extension options by composing shared configuration and extension-specific fields.
 *
 * @param composition - Declarative shared fragments and an extension field builder.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export function defineExtensionOptionsSchema<
	const Includes extends ExtensionOptionsConfigIncludes,
	const Shape extends z.ZodRawShape,
>(composition: {
	readonly extend: ExtensionOptionsShapeBuilder<Shape>
	readonly include: Includes
}): ExtensionOptionsDefinition<
	IncludedExtensionOptionsOutput<Includes> & z.output<z.ZodObject<Shape>>
>
export function defineExtensionOptionsSchema(
	input: ExtensionOptionsSchemaBuilder<ZodType> | ExtensionOptionsSchemaComposition,
): ExtensionOptionsDefinition<unknown> {
	return createExtensionOptionsDefinition(
		typeof input === 'function' ? input : (zod) => composeExtensionOptionsSchema(zod, input),
	)
}

/**
 * Defines extension options by extending a package-owned object schema.
 *
 * @param config - Shared configuration fragment owned by this package.
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export function defineExtensionOptionsShape<const Base, const Shape extends z.ZodRawShape>(
	config: ExtensionOptionsConfigFragment<Base>,
	builder: ExtensionOptionsShapeBuilder<Shape>,
): ExtensionOptionsDefinition<ExtendedExtensionOptionsOutput<Base, Shape>> {
	return createExtensionOptionsDefinition((zod) =>
		composeExtensionOptionsSchema(zod, { include: [config], extend: builder }),
	)
}

/**
 * Resolves a raw Zod schema or package-owned definition to its Zod schema.
 *
 * @param schema - Raw Zod schema or an opaque package-owned definition.
 * @returns The schema used to validate extension options.
 */
export function resolveExtensionOptionsSchema(
	schema: ExtensionOptionsValidator<unknown> | ExtensionOptionsDefinition<unknown>,
): ExtensionOptionsValidator<unknown> {
	if (extensionOptionsBuilder in schema) {
		return schema[extensionOptionsBuilder](z)
	}

	return schema
}
