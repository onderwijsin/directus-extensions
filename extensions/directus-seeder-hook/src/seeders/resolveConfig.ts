import type { SeederOptions } from '../env.schema'
import type { OperationMode, SeederConfig } from '../lib/config'
import type { CollectionConfig } from './config.schema'

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import {
	coreCollectionNameSchema,
	coreCollectionOverridesSchema,
	coreCollectionSchema,
} from './config.schema'
import { SYSTEM_COLLECTIONS } from './system/config'
import { systemCollectionOverridesSchema, systemCollectionSchema } from './system/config.schema'

const collectionNameSchema = z.enum(SYSTEM_COLLECTIONS.map(({ collection }) => collection))

/** JSON-only consumer configuration; unknown settings and collection names are errors. */
export const consumerConfigSchema = z.strictObject({
	$schema: z.string().optional(),
	$comment: z.string().optional(),
	core: z
		.strictObject({
			// Zod records omit __proto__; reject it before parsing so declarations never disappear.
			collections: z
				.unknown()
				.refine(
					(value) =>
						value === null ||
						typeof value !== 'object' ||
						!Object.hasOwn(value, '__proto__'),
					{ error: 'Reserved core collection name: __proto__' },
				)
				.pipe(z.record(coreCollectionNameSchema, coreCollectionOverridesSchema)),
			order: z
				.array(coreCollectionNameSchema)
				.refine((order) => new Set(order).size === order.length, {
					error: 'core.order must not contain duplicate collections',
				})
				.meta({
					uniqueItems: true,
					description:
						'Priority prefix; omitted collections follow in declaration order.',
				})
				.optional(),
		})
		.superRefine((core, context) => {
			for (const name of core.order ?? []) {
				if (!Object.hasOwn(core.collections, name))
					context.addIssue({
						code: 'custom',
						path: ['order'],
						message: `Unknown core collection: "${name}"`,
					})
			}
		})
		.optional(),
	system: z
		.strictObject({
			collections: z
				.partialRecord(collectionNameSchema, systemCollectionOverridesSchema)
				.optional(),
			order: z
				.array(collectionNameSchema)
				.refine((order) => new Set(order).size === order.length, {
					error: 'system.order must not contain duplicate collections',
				})
				.meta({
					uniqueItems: true,
					description:
						'Priority prefix; omitted collections follow in their built-in order. This does not select collections.',
				})
				.optional(),
		})
		.optional(),
})

/**
 * Merges independently supplied properties, then validates every effective collection.
 * @param input - Parsed JSON consumer configuration, or an empty object for defaults.
 * @returns Ordered, validated settings; omitted order entries retain their default order.
 * @throws Error with a configuration path when a setting is invalid.
 */
export function resolveSystemConfig(input: unknown = {}): CollectionConfig[] {
	return resolveConsumerConfig(input).systemCollections
}

/**
 * Resolves collections and explicit field provenance from the same validated consumer configuration.
 * @param input - Parsed JSON consumer configuration.
 * @returns Ordered, validated settings and collections with explicit consumer field selections.
 */
function resolveConsumerConfig(input: unknown) {
	const parsed = consumerConfigSchema.safeParse(input)
	if (!parsed.success) throw new Error(`Invalid Seeder configuration: ${parsed.error.message}`)
	const system = parsed.data.system
	const core = parsed.data.core
	const coreOrder = core?.order ?? []
	const coreCollections = Object.entries(core?.collections ?? {}).map(
		([collection, settings]) => {
			const { management, ...rest } = settings
			return { collection, ...rest, ...(management == null ? {} : { management }) }
		},
	)
	const order = system?.order ?? []
	const defaults = z.array(systemCollectionSchema).safeParse(SYSTEM_COLLECTIONS)
	if (!defaults.success)
		throw new Error(`Invalid Seeder system defaults: ${defaults.error.message}`)
	const collections = defaults.data.map((entry) => {
		const collection = { ...entry, ...system?.collections?.[entry.collection] }
		if (collection.management === null) delete collection.management
		return collection
	})
	const effective = z.array(systemCollectionSchema).safeParse(collections)
	if (!effective.success)
		throw new Error(`Invalid effective Seeder configuration: ${effective.error.message}`)
	return {
		coreCollections: [
			...coreOrder.flatMap((name) =>
				coreCollections.filter(({ collection }) => collection === name),
			),
			...coreCollections.filter(({ collection }) => !coreOrder.includes(collection)),
		],
		systemCollections: [
			...order.flatMap((name) =>
				effective.data.filter(({ collection }) => collection === name),
			),
			...effective.data.filter(({ collection }) => !order.includes(collection)),
		],
		systemFieldOverrides: Object.entries(system?.collections ?? {})
			.filter(([, overrides]) => overrides?.fields !== undefined)
			.map(([collection]) => collection),
	}
}

/**
 * Loads an explicitly configured JSON file, retaining defaults only when no path was supplied.
 * @param configPath - Path in the Directus runtime, relative to its working directory if needed.
 * @returns Effective collections and the provenance of explicit consumer field selections.
 * @throws Error for missing, unreadable, malformed or invalid explicitly configured files.
 */
export function loadConsumerConfig(configPath?: string): {
	coreCollections: CollectionConfig[]
	systemCollections: CollectionConfig[]
	systemFieldOverrides: string[]
} {
	if (configPath === undefined) return resolveConsumerConfig({})
	const filename = path.resolve(configPath)
	try {
		const input: unknown = JSON.parse(readFileSync(filename, 'utf8'))
		return resolveConsumerConfig(input)
	} catch (error) {
		throw new Error(
			`Failed to load Seeder configuration "${filename}": ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ cause: error },
		)
	}
}

/**
 * Validates collection settings again at mutation and cleanup boundaries, including internal callers.
 * @param config - Runtime configuration already resolved from environment and optional JSON.
 * @returns Validated system settings, using built-in defaults for internal callers without overrides.
 */
export function getSystemCollections(
	config: Pick<SeederConfig, 'systemCollections'>,
): CollectionConfig[] {
	const parsed = z
		.array(systemCollectionSchema)
		.safeParse(config.systemCollections ?? SYSTEM_COLLECTIONS)
	if (!parsed.success)
		throw new Error(`Invalid effective Seeder configuration: ${parsed.error.message}`)
	return parsed.data
}

/**
 * Returns validated settings for the selected scope at import and extraction boundaries.
 * @param config - Effective runtime settings and explicit scope.
 * @returns Ordered collections, with no application defaults.
 */
export function getCollections(
	config: Pick<SeederConfig, 'dataScope' | 'systemCollections' | 'coreCollections'>,
): CollectionConfig[] {
	if (config.dataScope === 'system') return getSystemCollections(config)
	const parsed = z.array(coreCollectionSchema).safeParse(config.coreCollections ?? [])
	if (!parsed.success)
		throw new Error(`Invalid effective Seeder core configuration: ${parsed.error.message}`)
	return parsed.data
}

/**
 * Map validated startup options and apply explicit CLI overrides.
 * @param options - Validated, normalized startup configuration.
 * @param overrides - Explicit CLI values; absent values retain the environment configuration.
 * @returns Runtime configuration with validated JSON collection settings and explicit CLI overrides.
 */
export function resolveSeederConfig(
	options: SeederOptions,
	overrides: Partial<
		Omit<
			SeederConfig,
			'jsonIndent' | 'systemCollections' | 'coreCollections' | 'systemFieldOverrides'
		>
	> & { operationMode?: OperationMode } = {},
): SeederConfig {
	const consumer = loadConsumerConfig(options.SEEDER_CONFIG_PATH)
	// Core names can only be checked after loading consumer declarations. Keep this validation
	// independent of enablement and never apply the automatic allowlist to manual selection.
	if (options.SEEDER_AUTO_EXTRACT_INCLUDE !== undefined) {
		const names = [...consumer.systemCollections, ...consumer.coreCollections].map(
			({ collection }) => collection,
		)
		const selection = z
			.array(z.enum(names))
			.min(1)
			.safeParse(options.SEEDER_AUTO_EXTRACT_INCLUDE)
		if (!selection.success)
			throw new Error(`Invalid SEEDER_AUTO_EXTRACT_INCLUDE: ${selection.error.message}`)
	}
	return {
		coreCollections: consumer.coreCollections.map((collection) => ({
			...collection,
			...(overrides.operationMode === undefined
				? {}
				: { operationMode: overrides.operationMode }),
		})),
		systemFieldOverrides: consumer.systemFieldOverrides,
		systemCollections: consumer.systemCollections.map((collection) => ({
			...collection,
			...(overrides.operationMode === undefined
				? {}
				: { operationMode: overrides.operationMode }),
		})),
		dataScope: overrides.dataScope ?? options.SEEDER_SCOPE,
		includeCollections: overrides.includeCollections ?? options.SEEDER_INCLUDE,
		excludeCollections: overrides.excludeCollections ?? options.SEEDER_EXCLUDE,
		continueOnError: overrides.continueOnError ?? options.SEEDER_CONTINUE_ON_ERROR,
		batchSize: overrides.batchSize ?? options.SEEDER_BATCH_SIZE,
		enableFullIdempotent:
			overrides.enableFullIdempotent ?? options.SEEDER_ENABLE_FULL_IDEMPOTENT,
		skipClean: overrides.skipClean ?? false,
		jsonOnly: overrides.jsonOnly ?? options.SEEDER_JSON_ONLY,
		jsonIndent: options.SEEDER_JSON_INDENT === 'tab' ? '\t' : options.SEEDER_JSON_INDENT_SIZE,
	}
}
