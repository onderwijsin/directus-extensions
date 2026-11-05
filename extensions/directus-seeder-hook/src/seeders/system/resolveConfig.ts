import type { SeederConfig } from '../../lib/config'
import type { SystemCollectionConfig } from './config.schema'

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import { SYSTEM_COLLECTIONS } from './config'
import { collectionOverridesSchema, systemCollectionSchema } from './config.schema'

const collectionNameSchema = z.enum(SYSTEM_COLLECTIONS.map(({ collection }) => collection))

/** JSON-only consumer configuration; unknown settings and collection names are errors. */
export const consumerConfigSchema = z.strictObject({
	$schema: z.string().optional(),
	$comment: z.string().optional(),
	system: z
		.strictObject({
			collections: z
				.partialRecord(collectionNameSchema, collectionOverridesSchema)
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
export function resolveSystemConfig(input: unknown = {}): SystemCollectionConfig[] {
	const parsed = consumerConfigSchema.safeParse(input)
	if (!parsed.success) throw new Error(`Invalid Seeder configuration: ${parsed.error.message}`)
	const system = parsed.data.system
	const order = system?.order ?? []
	const defaults = z.array(systemCollectionSchema).safeParse(SYSTEM_COLLECTIONS)
	if (!defaults.success)
		throw new Error(`Invalid Seeder system defaults: ${defaults.error.message}`)
	const collections = defaults.data.map((entry) => ({
		...entry,
		...system?.collections?.[entry.collection],
	}))
	const effective = z.array(systemCollectionSchema).safeParse(collections)
	if (!effective.success)
		throw new Error(`Invalid effective Seeder configuration: ${effective.error.message}`)
	return [
		...order.flatMap((name) => effective.data.filter(({ collection }) => collection === name)),
		...effective.data.filter(({ collection }) => !order.includes(collection)),
	]
}

/**
 * Loads an explicitly configured JSON file, retaining defaults only when no path was supplied.
 * @param configPath - Path in the Directus runtime, relative to its working directory if needed.
 * @returns Validated effective system collection configuration.
 * @throws Error for missing, unreadable, malformed or invalid explicitly configured files.
 */
export function loadSystemConfig(configPath?: string): SystemCollectionConfig[] {
	if (configPath === undefined) return resolveSystemConfig()
	const filename = path.resolve(configPath)
	try {
		const input: unknown = JSON.parse(readFileSync(filename, 'utf8'))
		return resolveSystemConfig(input)
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
): SystemCollectionConfig[] {
	const parsed = z
		.array(systemCollectionSchema)
		.safeParse(config.systemCollections ?? SYSTEM_COLLECTIONS)
	if (!parsed.success)
		throw new Error(`Invalid effective Seeder configuration: ${parsed.error.message}`)
	return parsed.data
}
