import { z, type ZodType } from 'zod'

const extensionOptionsBuilder = Symbol('extension-options-builder')
const extensionOptionsOutput = Symbol('extension-options-output')

/**
 * Appends a schema definition slot to a diagnostic location.
 *
 * @param parent - Parent schema location.
 * @param slot - Definition slot below the parent.
 * @returns The nested schema location.
 */
function schemaLocation(parent: string, slot: string): string {
	return `${parent}.${slot}`
}

/**
 * Verifies one schema graph uses only the package-owned Zod runtime.
 * Traverses the schema-bearing slots of the pinned Zod Core definitions.
 *
 * @param value - Possible schema to inspect.
 * @param location - Schema definition location used for diagnostics.
 * @param visited - Package-owned schemas already traversed.
 * @returns Nothing when the reachable schema graph uses the package-owned runtime.
 * @throws When a schema was created by another Zod runtime.
 */
function assertPackageZodSchema(
	value: unknown,
	location: string,
	visited: WeakSet<z.core.$ZodType>,
): void {
	if (!(value instanceof z.core.$ZodType)) return
	// Every schema receives its core module's version object. Equal version numbers
	// alone do not establish that two schemas came from the same runtime.
	if (value._zod.version !== z.core.version) {
		throw new Error(
			`All schemas in an extension options builder must use its supplied z instance; found a schema from another Zod runtime at ${location}.`,
		)
	}
	if (visited.has(value)) return
	visited.add(value)

	for (const [index, check] of (value._zod.def.checks ?? []).entries()) {
		const checkLocation = schemaLocation(location, `checks[${index}]`)
		assertPackageZodSchema(check, checkLocation, visited)
		if (check instanceof z.core.$ZodCheckProperty) {
			assertPackageZodSchema(
				check._zod.def.schema,
				schemaLocation(checkLocation, 'schema'),
				visited,
			)
		}
	}

	if (value instanceof z.core.$ZodObject) {
		for (const [key, schema] of Object.entries(value._zod.def.shape)) {
			assertPackageZodSchema(
				schema,
				schemaLocation(location, `shape[${JSON.stringify(key)}]`),
				visited,
			)
		}
		assertPackageZodSchema(
			value._zod.def.catchall,
			schemaLocation(location, 'catchall'),
			visited,
		)
		return
	}
	if (value instanceof z.core.$ZodArray) {
		assertPackageZodSchema(value._zod.def.element, schemaLocation(location, 'element'), visited)
		return
	}
	if (value instanceof z.core.$ZodUnion) {
		for (const [index, option] of value._zod.def.options.entries()) {
			assertPackageZodSchema(option, schemaLocation(location, `options[${index}]`), visited)
		}
		return
	}
	if (value instanceof z.core.$ZodIntersection) {
		assertPackageZodSchema(value._zod.def.left, schemaLocation(location, 'left'), visited)
		assertPackageZodSchema(value._zod.def.right, schemaLocation(location, 'right'), visited)
		return
	}
	if (value instanceof z.core.$ZodTuple) {
		for (const [index, item] of value._zod.def.items.entries()) {
			assertPackageZodSchema(item, schemaLocation(location, `items[${index}]`), visited)
		}
		assertPackageZodSchema(value._zod.def.rest, schemaLocation(location, 'rest'), visited)
		return
	}
	if (value instanceof z.core.$ZodRecord || value instanceof z.core.$ZodMap) {
		assertPackageZodSchema(value._zod.def.keyType, schemaLocation(location, 'keyType'), visited)
		assertPackageZodSchema(
			value._zod.def.valueType,
			schemaLocation(location, 'valueType'),
			visited,
		)
		return
	}
	if (value instanceof z.core.$ZodSet) {
		assertPackageZodSchema(
			value._zod.def.valueType,
			schemaLocation(location, 'valueType'),
			visited,
		)
		return
	}
	if (
		value instanceof z.core.$ZodOptional ||
		value instanceof z.core.$ZodNullable ||
		value instanceof z.core.$ZodDefault ||
		value instanceof z.core.$ZodPrefault ||
		value instanceof z.core.$ZodNonOptional ||
		value instanceof z.core.$ZodSuccess ||
		value instanceof z.core.$ZodCatch ||
		value instanceof z.core.$ZodReadonly ||
		value instanceof z.core.$ZodPromise
	) {
		assertPackageZodSchema(
			value._zod.def.innerType,
			schemaLocation(location, 'innerType'),
			visited,
		)
		return
	}
	if (value instanceof z.core.$ZodPipe) {
		assertPackageZodSchema(value._zod.def.in, schemaLocation(location, 'in'), visited)
		assertPackageZodSchema(value._zod.def.out, schemaLocation(location, 'out'), visited)
		return
	}
	if (value instanceof z.core.$ZodFunction) {
		assertPackageZodSchema(value._zod.def.input, schemaLocation(location, 'input'), visited)
		assertPackageZodSchema(value._zod.def.output, schemaLocation(location, 'output'), visited)
		return
	}
	if (value instanceof z.core.$ZodTemplateLiteral) {
		for (const [index, part] of value._zod.def.parts.entries()) {
			assertPackageZodSchema(part, schemaLocation(location, `parts[${index}]`), visited)
		}
		return
	}
	if (value instanceof z.core.$ZodLazy) {
		assertPackageZodSchema(value._zod.innerType, schemaLocation(location, 'innerType'), visited)
	}
}

/**
 * Verifies a resolved extension options schema uses the package-owned Zod runtime.
 *
 * @param schema - Resolved schema to inspect before parsing.
 * @returns Nothing when every schema uses the package-owned runtime.
 * @throws When the schema graph contains a schema from another Zod runtime.
 */
function assertPackageZodRuntime(schema: ZodType): void {
	assertPackageZodSchema(schema, '$', new WeakSet())
}

/** Builds an extension options schema with the Zod runtime owned by this package. */
export type ExtensionOptionsSchemaBuilder<Schema extends ZodType> = (zod: typeof z) => Schema

/** Builds additional object fields with the Zod runtime owned by this package. */
export type ExtensionOptionsShapeBuilder<Shape extends z.ZodRawShape> = (zod: typeof z) => Shape

/** The output of a shared object schema extended with extension-specific fields. */
export type ExtendedExtensionOptionsOutput<
	Base extends z.ZodObject,
	Shape extends z.ZodRawShape,
> = Omit<z.output<Base>, keyof Shape> & z.output<z.ZodObject<Shape>>

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
 * Defines an extension options schema without exposing its Zod object to consumers.
 *
 * @param builder - Builds the schema with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export function defineExtensionOptionsSchema<const Schema extends ZodType>(
	builder: ExtensionOptionsSchemaBuilder<Schema>,
): ExtensionOptionsDefinition<z.output<Schema>> {
	return createExtensionOptionsDefinition(builder)
}

/**
 * Defines extension options by extending a package-owned object schema.
 *
 * @param baseSchema - Shared object schema owned by this package.
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export function defineExtensionOptionsShape<
	const Base extends z.ZodObject,
	const Shape extends z.ZodRawShape,
>(
	baseSchema: Base,
	builder: ExtensionOptionsShapeBuilder<Shape>,
): ExtensionOptionsDefinition<ExtendedExtensionOptionsOutput<Base, Shape>> {
	return createExtensionOptionsDefinition((zod) => baseSchema.safeExtend(builder(zod)))
}

/**
 * Resolves a legacy schema or package-owned definition to its Zod schema.
 *
 * @param schema - Legacy Zod schema or an opaque package-owned definition.
 * @returns The schema used to validate extension options.
 */
export function resolveExtensionOptionsSchema(
	schema: ZodType | ExtensionOptionsDefinition<unknown>,
): ZodType {
	if (extensionOptionsBuilder in schema) {
		const resolvedSchema = schema[extensionOptionsBuilder](z)
		assertPackageZodRuntime(resolvedSchema)
		return resolvedSchema
	}

	return schema
}
