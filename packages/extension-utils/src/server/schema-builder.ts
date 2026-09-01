import { z, type ZodType } from 'zod'

const extensionOptionsBuilder = Symbol('extension-options-builder')
const extensionOptionsOutput = Symbol('extension-options-output')

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
		return schema[extensionOptionsBuilder](z)
	}

	return schema
}
