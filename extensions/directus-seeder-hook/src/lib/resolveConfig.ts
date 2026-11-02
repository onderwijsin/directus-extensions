import type { SeederOptions } from '../env.schema'
import type { SeederConfig } from './config'

/**
 * Map validated startup options and apply explicit CLI overrides.
 * @param options - Validated, normalized startup configuration.
 * @param overrides - Explicit CLI values; absent values retain the environment configuration.
 * @returns Runtime configuration without additional parsing or defaults.
 */
export function resolveSeederConfig(
	options: SeederOptions,
	overrides: Partial<Omit<SeederConfig, 'jsonIndent'>> = {},
): SeederConfig {
	return {
		operationMode: overrides.operationMode ?? options.SEEDER_MODE,
		dataScope: overrides.dataScope ?? options.SEEDER_SCOPE,
		includeCollections: overrides.includeCollections ?? options.SEEDER_INCLUDE,
		excludeCollections: overrides.excludeCollections ?? options.SEEDER_EXCLUDE,
		continueOnError: overrides.continueOnError ?? options.SEEDER_CONTINUE_ON_ERROR,
		batchSize: overrides.batchSize ?? options.SEEDER_BATCH_SIZE,
		enableFullIdempotent:
			overrides.enableFullIdempotent ?? options.SEEDER_ENABLE_FULL_IDEMPOTENT,
		clearExistingSeeds: overrides.clearExistingSeeds ?? options.SEEDER_CLEAR_DATA_BEFORE_SEED,
		extractAssets: overrides.extractAssets ?? options.SEEDER_EXTRACT_ASSETS,
		autoExtract: overrides.autoExtract ?? options.SEEDER_AUTO_EXTRACT,
		jsonIndent: options.SEEDER_JSON_INDENT === 'tab' ? '\t' : options.SEEDER_JSON_INDENT_SIZE,
	}
}

/**
 * Expose validated paths under the runtime folder names.
 * @param options - Validated startup options.
 * @returns Seed and asset paths.
 */
export function getFolderPaths(options: SeederOptions) {
	return { seedsFolder: options.SEEDER_SEEDS_FOLDER, assetsFolder: options.SEEDER_ASSETS_DIR }
}
