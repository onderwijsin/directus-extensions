import type { SeederConfig } from './config'

import { isArray } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import { jsonIndentSchema } from '../env.schema'
import { DataScope, OperationMode } from './config'

const envStringSchema = z.coerce.string()

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: SeederConfig = {
	operationMode: OperationMode.INSERT_MISSING,
	dataScope: DataScope.SYSTEM,
	continueOnError: false,
	batchSize: 50,
	enableFullIdempotent: false,
	clearExistingSeeds: false,
	extractAssets: true,
	autoExtract: false,
}

/**
 * Parses and converts an input value into a boolean. If the input value is a string,
 * it checks for specific truthy values ('true', '1'), ignoring its case, and returns true.
 * Returns false for undefined inputs or values that do not match the criteria.
 *
 * @param {string|boolean|undefined} value - The input value to be converted to a boolean.
 * Can be of type string, boolean, or undefined.
 * @returns {boolean} The boolean representation of the input value. Returns true for
 * 'true' (case-insensitive) and '1', and false otherwise.
 */
function parseBooleanEnv(value: unknown): boolean {
	if (typeof value === 'boolean') return value

	if (typeof value === 'string') {
		return value.toLowerCase() === 'true' || value === '1'
	}

	return false
}

/**
 * Get operation mode from string.
 *
 * @param mode Operation mode string
 * @returns Operation mode
 */
function getOperationMode(mode: unknown): OperationMode {
	if (typeof mode !== 'string') throw new TypeError('mode.toLowerCase is not a function')
	switch (mode.toLowerCase()) {
		case OperationMode.INSERT_MISSING:
			return OperationMode.INSERT_MISSING
		case OperationMode.INSERT_UPDATE:
			return OperationMode.INSERT_UPDATE
		case OperationMode.FULL_IDEMPOTENT:
			return OperationMode.FULL_IDEMPOTENT
		default:
			return OperationMode.INSERT_MISSING
	}
}

/**
 * Get data scope from string.
 *
 * @param scope Data scope string
 * @returns Data scope
 */
function getDataScope(scope: unknown): DataScope {
	if (typeof scope !== 'string') throw new TypeError('scope.toLowerCase is not a function')
	switch (scope.toLowerCase()) {
		case DataScope.SYSTEM:
			return DataScope.SYSTEM
		default:
			return DataScope.SYSTEM
	}
}

/**
 * Preserves environment comma splitting and Directus's pre-cast list support.
 * @param value - Raw environment collection selection.
 * @returns A collection list, or undefined for an absent or falsy value.
 */
function parseCollectionList(value: unknown): unknown[] | undefined {
	if (!value) return undefined
	if (isArray(value)) return value
	if (typeof value !== 'string') throw new TypeError('value.split is not a function')
	return value.split(',').map((entry) => entry.trim())
}

/**
 * Parse environment variables and merge with provided config.
 *
 * @param env Environment variables
 * @param config Partial configuration to merge with environment variables
 * @returns Complete seeder configuration
 */
export function parseEnvConfig(
	env: Record<string, unknown>,
	config: Partial<SeederConfig> = {},
): SeederConfig {
	// Parse operation mode from config or environment variable
	const operationMode =
		config.operationMode ??
		(env.SEEDER_MODE ? getOperationMode(env.SEEDER_MODE) : DEFAULT_CONFIG.operationMode)

	// Parse data scope from config or environment variable
	const dataScope =
		config.dataScope ?? (env.SEEDER_SCOPE ? getDataScope(env.SEEDER_SCOPE) : DataScope.SYSTEM)

	// Directus may cast comma-separated environment values to arrays before this boundary.
	const includeCollections = config.includeCollections ?? parseCollectionList(env.SEEDER_INCLUDE)
	const excludeCollections = config.excludeCollections ?? parseCollectionList(env.SEEDER_EXCLUDE)

	// Parse continue on error flag
	const continueOnError =
		typeof config.continueOnError !== 'undefined'
			? config.continueOnError
			: parseBooleanEnv(env.SEEDER_CONTINUE_ON_ERROR) || DEFAULT_CONFIG.continueOnError

	// Parse batch size
	const batchSize =
		config.batchSize ??
		(env.SEEDER_BATCH_SIZE
			? Number.parseInt(envStringSchema.parse(env.SEEDER_BATCH_SIZE), 10)
			: DEFAULT_CONFIG.batchSize)

	// Parse enable full idempotent flag
	const enableFullIdempotent =
		typeof config.enableFullIdempotent !== 'undefined'
			? config.enableFullIdempotent
			: parseBooleanEnv(env.SEEDER_ENABLE_FULL_IDEMPOTENT) ||
				DEFAULT_CONFIG.enableFullIdempotent

	// Parse clear existing seeds flag
	const clearExistingSeeds =
		typeof config.clearExistingSeeds !== 'undefined'
			? config.clearExistingSeeds
			: parseBooleanEnv(env.SEEDER_CLEAR_DATA_BEFORE_SEED) ||
				DEFAULT_CONFIG.clearExistingSeeds

	// Parse extract assets flag
	const extractAssets =
		typeof config.extractAssets !== 'undefined'
			? config.extractAssets
			: parseBooleanEnv(env.SEEDER_EXTRACT_ASSETS) || DEFAULT_CONFIG.extractAssets

	// Parse auto extract flag
	const autoExtract =
		typeof config.autoExtract !== 'undefined'
			? config.autoExtract
			: parseBooleanEnv(env.SEEDER_AUTO_EXTRACT) || DEFAULT_CONFIG.autoExtract

	return {
		operationMode,
		dataScope,
		includeCollections,
		excludeCollections,
		continueOnError,
		batchSize,
		enableFullIdempotent,
		clearExistingSeeds,
		extractAssets,
		autoExtract,
		jsonIndent: config.jsonIndent ?? jsonIndentSchema.parse(env.SEEDER_JSON_INDENT),
	}
}

/**
 * Get folder paths from environment variables or defaults.
 *
 * @param env Environment variables
 * @returns Folder paths for seeds and assets
 */
export function getFolderPaths(env: Record<string, unknown>) {
	let defaultSeedsFolder = '/directus/seeds'
	if (
		typeof env.SEEDER_SEEDS_FOLDER !== 'undefined' &&
		typeof env.SEEDER_SEEDS_FOLDER === 'string' &&
		env.SEEDER_SEEDS_FOLDER.trim().length > 0
	) {
		defaultSeedsFolder = env.SEEDER_SEEDS_FOLDER.trim()
	}

	let defaultAssetsDir = '/directus/seeds/assets'
	if (
		typeof env.SEEDER_ASSETS_DIR !== 'undefined' &&
		typeof env.SEEDER_ASSETS_DIR === 'string' &&
		env.SEEDER_ASSETS_DIR.trim().length > 0
	) {
		defaultAssetsDir = env.SEEDER_ASSETS_DIR.trim()
	}
	return { seedsFolder: defaultSeedsFolder, assetsFolder: defaultAssetsDir }
}
