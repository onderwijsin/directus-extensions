import type { SeederOptions } from '../env.schema'
import type { DataScope, OperationMode, SeederConfig } from './config'

import path from 'node:path'

import { loadSystemConfig } from '../seeders/system/resolveConfig'

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
	const system = loadSystemConfig(options.SEEDER_CONFIG_PATH)
	return {
		coreCollections: system.coreCollections.map((collection) => ({
			...collection,
			...(overrides.operationMode === undefined
				? {}
				: { operationMode: overrides.operationMode }),
		})),
		systemFieldOverrides: system.systemFieldOverrides,
		systemCollections: system.systemCollections.map((collection) => ({
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
		autoExtract: overrides.autoExtract ?? options.SEEDER_AUTO_EXTRACT,
		jsonIndent: options.SEEDER_JSON_INDENT === 'tab' ? '\t' : options.SEEDER_JSON_INDENT_SIZE,
	}
}

/**
 * Derives scope output from the seed root and preserves the independent asset path.
 * @param options - Validated startup options.
 * @param scope - Selected scope; existing callers retain system output.
 * @returns Scoped seed and independent asset paths.
 */
export function getFolderPaths(options: SeederOptions, scope: DataScope = 'system') {
	return {
		seedsFolder: path.join(options.SEEDER_SEEDS_DIR, scope),
		assetsFolder: options.SEEDER_ASSETS_DIR,
	}
}
