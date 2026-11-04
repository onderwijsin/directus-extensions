import type { SeederOptions } from '../../env.schema'
import type { CollectionDataProvider } from '../../lib/seedDataParser'
import type { SeedItem } from '../../lib/seedItem'

import { readFile, stat } from 'node:fs/promises'

import { z } from 'zod'

const seedStringSchema = z.coerce.string()
import path from 'node:path'

import { getFolderPaths } from '../../lib/resolveConfig'
import { createCollectionDataProvider } from '../../lib/seedDataParser'
import { seedItemsSchema, toSeedRecord, getStringField } from '../../lib/seedItem'
import { SYSTEM_COLLECTIONS_ORDER } from './config'

/**
 * System Directus Collections Data Management (simplified)
 *
 * Most system collections are imported directly from their JSON files without
 * any nesting or relationship resolution logic.
 *
 * Special handling only applies to:
 * - directus_operations: uses two-pass import to handle resolve/reject FK constraints
 * - directus_policies: preserves explicit TFA enforcement and requires TFA for
 *   admin or Studio access in production
 * - directus_users: supports environment-based superuser configuration
 * - directus_flows: environment-based filtering of development-only flows ([Dev] pattern)
 */

// System configuration constant for environment-based flow filtering
const FLOW_DEVELOPMENT_PATTERN = /\[dev]/i // Case-insensitive, matches anywhere in flow name
const SUPER_USER_TITLE = 'super user'
const ADMIN_FIRST_NAME = 'admin'
const ADMIN_LAST_NAMES = ['developer', 'user']

/**
 * Type representing the keys of system collections from the configuration.
 * This ensures type safety when working with collection names.
 */
type SystemCollectionKey = (typeof SYSTEM_COLLECTIONS_ORDER)[number]

/** Validated options consumed by environment-dependent seed transformations. */
type EnvironmentConfig = Pick<
	SeederOptions,
	'DEFAULT_EMAIL' | 'DEFAULT_PASSWORD' | 'DEPLOYMENT_ENV'
>

/**
 * Interface representing a collection's data structure.
 * Combines collection metadata with its parsed data array.
 */
interface SystemCollectionData {
	/** The collection identifier from SYSTEM_COLLECTIONS_ORDER */
	collection: SystemCollectionKey
	/** Array of parsed items for this collection */
	data: SeedItem[]
}

/**
 * Collections that should be excluded from system seeding.
 * These are system-level and not imported by the seeder.
 */
const excludedSystemCollections = ['directus_extensions']

/**
 * Collections that require special handling.
 * - directus_operations: two-pass import to satisfy FK constraints
 * - directus_policies: environment-based TFA enforcement
 * - directus_users: environment-based superuser configuration
 * - directus_flows: environment-based filtering of development-only flows
 */
const specialSystemCollections = [
	'directus_operations',
	'directus_policies',
	'directus_users',
	'directus_flows',
]

/**
 * Type guard to check if a collection should be excluded from standard seeding.
 *
 * @param collection - Collection name to check
 * @returns True if a collection should be excluded from standard seeding
 */
const isExcludedCollection = (collection: SystemCollectionKey): boolean =>
	excludedSystemCollections.includes(collection)

/**
 * Type guard to check if a collection requires special handling.
 * Special collections have complex nested relationships that need custom processing.
 *
 * @param collection - Collection name to check
 * @returns True if a collection requires special handling
 */
const isSpecialCollection = (collection: SystemCollectionKey): boolean =>
	specialSystemCollections.includes(collection)

/**
 * Validates that parsed JSON data is an array as expected for collection data.
 * Collection seed files should always contain arrays of items.
 *
 * @param data - Unknown data from JSON parsing
 * @returns Type predicate confirming data is a valid collection array
 */
const validateCollectionData = (data: unknown): data is SeedItem[] =>
	seedItemsSchema.safeParse(data).success

/**
 * Parses and validates JSON content for a specific collection.
 * Rejects invalid input without substituting an empty dataset.
 *
 * @param collection - Collection name for type inference and error reporting
 * @param fileContent - Raw JSON string content from file
 * @returns The original array, preserving every row unchanged
 * @throws If JSON syntax or the array boundary is invalid
 */
const parseCollectionData = (collection: SystemCollectionKey, fileContent: string): SeedItem[] => {
	const parsedData: unknown = JSON.parse(fileContent)
	if (!validateCollectionData(parsedData)) {
		throw new Error(`Expected a JSON array for collection "${collection}"`)
	}
	return parsedData
}

/**
 * Loads required system collection input from the seeds folder.
 * Preflights required JSON files in SYSTEM_COLLECTIONS_ORDER before any database operations.
 * Only ENOENT omits a collection; an explicit empty array remains seed data.
 * Reads of unused files only detect their presence; their content and errors are ignored.
 *
 * @param seedsFolder - Path to the folder containing collection JSON files
 * @param requiredCollections - Selected collections and any required Flow metadata
 * @returns Required collection data, or null when no supported files exist
 * @throws If the seed directory is missing or invalid, or required input cannot be read, parsed, or validated
 */
const getSystemCollectionData = async (
	seedsFolder: string,
	requiredCollections: string[],
): Promise<SystemCollectionData[] | null> => {
	try {
		const directory = await stat(seedsFolder)
		if (!directory.isDirectory()) {
			throw new Error(`Seed path is not a directory: "${seedsFolder}"`)
		}
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			throw new Error(`Seed directory does not exist: "${seedsFolder}"`, { cause: error })
		}
		const message = error instanceof Error ? error.message : 'Unknown directory error'
		throw new Error(`Failed to inspect seed directory "${seedsFolder}": ${message}`, {
			cause: error,
		})
	}

	const results: SystemCollectionData[] = []
	let hasSupportedSeedFiles = false

	// Process each collection in the defined order
	for (const collection of SYSTEM_COLLECTIONS_ORDER) {
		// Construct file path: seeds/{collection}.json
		const dataFilePath = path.join(seedsFolder, `${collection}.json`)
		const required = requiredCollections.includes(collection)
		try {
			// Read and parse collection data file
			const fileContent = await readFile(dataFilePath, 'utf-8')
			hasSupportedSeedFiles = true
			if (!required) continue
			const data = parseCollectionData(collection, fileContent)
			results.push({ collection, data })
		} catch (error) {
			if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
			if (!required) {
				hasSupportedSeedFiles = true
				continue
			}
			const errorMessage = error instanceof Error ? error.message : 'Unknown file error'
			throw new Error(
				`Failed to load seed file "${dataFilePath}" for collection "${collection}": ${errorMessage}`,
				{ cause: error },
			)
		}
	}

	return hasSupportedSeedFiles ? results : null
}

/**
 * Builds a dependency graph for operations based on resolve/reject references.
 * Operations can reference other operations through resolve/reject fields, creating dependencies.
 *
 * @param operations - Array of operation objects to analyze
 * @returns Map where keys are operation IDs and values are Sets of their dependencies
 */
const buildOperationDependencies = (operations: SeedItem[]): Map<unknown, Set<string>> => {
	const dependencies = new Map<unknown, Set<string>>()

	operations.forEach((op) => {
		// Skip operations without IDs
		if (!toSeedRecord(op).id) return

		const deps = new Set<string>()

		// Check if an operation has a reject reference to another operation
		const reject = toSeedRecord(op).reject
		if (reject && typeof reject === 'string') deps.add(reject)

		// Check if an operation has a resolve reference to another operation
		const resolve = toSeedRecord(op).resolve
		if (resolve && typeof resolve === 'string') deps.add(resolve)

		// Store dependencies for this operation
		dependencies.set(toSeedRecord(op).id, deps)
	})

	return dependencies
}

/**
 * Sort operations to ensure that any referenced foreign key is already created.
 * This means that the operations that resolve or reject to another operation need to be created
 * after that operation. This is a topological sort implementation with circular dependency
 * detection.
 *
 * @param operations - Array of operation objects to sort
 * @returns Sorted array of operation objects respecting dependencies
 */
export const sortOperationsForKeyConstraints = (operations: SeedItem[]): SeedItem[] => {
	// Create lookup map for O(1) operation access by ID
	const operationMap = new Map<unknown, SeedItem>()

	// Build dependency graph
	const dependencies = buildOperationDependencies(operations)

	// Track visited states for cycle detection
	const visited = new Set<unknown>() // Completely processed
	const visiting = new Set<unknown>() // Currently being processed
	const sorted: SeedItem[] = []

	// Build operation lookup map
	operations.forEach((operation) => {
		if (toSeedRecord(operation).id) {
			operationMap.set(toSeedRecord(operation).id, operation)
		}
	})

	/**
	 * Recursive depth-first search for topological sorting.
	 * Visits dependencies before the operation itself.
	 * @param operation - Operation whose dependencies should be visited.
	 * @returns Nothing.
	 */
	const visit = (operation: SeedItem) => {
		// Skip operations without IDs
		if (!toSeedRecord(operation).id) return

		// Skip already processed operations
		if (visited.has(toSeedRecord(operation).id)) return

		// Detect circular dependencies
		if (visiting.has(toSeedRecord(operation).id)) {
			// @todo: replace console.* with logger.*
			console.warn(
				`Circular dependency detected for operation ${seedStringSchema.parse(toSeedRecord(operation).id)}`,
			)
			return
		}

		// Mark as currently being processed
		visiting.add(toSeedRecord(operation).id)

		// Get dependencies for this operation
		const operationDependencies = dependencies.get(toSeedRecord(operation).id) ?? new Set()

		// Operations with no dependencies go first
		if (operationDependencies.size === 0) {
			// Add to the beginning
			sorted.unshift(operation)
		} else {
			// Visit all dependencies first
			operationDependencies.forEach((dependencyId) => {
				const dependencyOperation = operationMap.get(dependencyId)
				if (dependencyOperation) {
					visit(dependencyOperation)
				}
			})
			// Add to end after dependencies are processed
			sorted.push(operation)
		}

		// Mark as completely processed
		visiting.delete(toSeedRecord(operation).id)
		visited.add(toSeedRecord(operation).id)
	}

	// Process all operations
	operations.forEach((operation) => visit(operation))

	return sorted
}

/**
 * Prepare operations for two-pass import by stripping resolve/reject references
 * in the first pass and collecting them for a second pass update.
 *
 * @param operations - The original operations array
 * @returns Tuple: [operationsWithoutRefs, referencesMap]
 */
const prepareOperationsForTwoPassImport = (
	operations: SeedItem[],
): [SeedItem[], Map<unknown, { resolve?: string | null; reject?: string | null }>] => {
	const referencesMap = new Map<unknown, { resolve?: string | null; reject?: string | null }>()

	const operationsWithoutRefs = operations.map((operation) => {
		// If there's no id, we can't update it later — return as-is
		if (!toSeedRecord(operation).id) return operation

		const refs: { resolve?: string | null; reject?: string | null } = {}

		// Capture resolve if present (string or null)
		if ('resolve' in toSeedRecord(operation)) {
			const resolve = toSeedRecord(operation).resolve
			if (typeof resolve === 'string') refs.resolve = resolve
			else if (toSeedRecord(operation).resolve === null) refs.resolve = null
		}

		// Capture reject if present (string or null)
		if ('reject' in toSeedRecord(operation)) {
			const reject = toSeedRecord(operation).reject
			if (typeof reject === 'string') refs.reject = reject
			else if (toSeedRecord(operation).reject === null) refs.reject = null
		}

		// Only store references if at least one is a non-null string
		// This ensures we only update operations that actually have references
		const hasActualReferences =
			typeof refs.resolve === 'string' || typeof refs.reject === 'string'

		if (hasActualReferences) {
			referencesMap.set(toSeedRecord(operation).id, refs)
		}

		// Return operation with references nullified for first-pass insert
		// Note: We explicitly preserve all fields including required ones like 'key'
		// to ensure Directus' createMany includes them in the insert statement
		return {
			...toSeedRecord(operation),
			resolve: null,
			reject: null,
		}
	})

	return [operationsWithoutRefs, referencesMap]
}

/**
 * Creates minimal update operations for the second pass, restoring resolve/reject
 * references without re-sending other fields.
 *
 * These operations are marked with __isUpdateOnly to signal the seeder strategy
 * to use upsert instead of create, avoiding issues with missing required fields.
 *
 * @param referencesMap - Map of operation IDs to their collected references
 * @returns Array of partial operation updates with id, resolve, reject, and metadata
 */
const createOperationUpdates = (
	referencesMap: Map<unknown, { resolve?: string | null; reject?: string | null }>,
): SeedItem[] => {
	const updates: SeedItem[] = []

	referencesMap.forEach((refs, id) => {
		updates.push({
			id,
			resolve: refs.resolve ?? null,
			reject: refs.reject ?? null,
			// Mark this as an update-only item so the seeder strategy knows to use upsert
			__isUpdateOnly: true,
		})
	})

	return updates
}

/**
 * Identifies a superuser by checking title or name patterns.
 * Superusers will get special handling for email, password and status.
 *
 * @param user - User object to check
 * @returns True if user matches superuser patterns
 */
export const isSuperUser = (user: SeedItem): boolean => {
	// Check if title matches superuser pattern
	const titleMatch = getStringField(user, 'title')?.toLowerCase() === SUPER_USER_TITLE

	// Check if the name matches an admin pattern
	const nameMatch =
		getStringField(user, 'first_name')?.toLowerCase() === ADMIN_FIRST_NAME &&
		ADMIN_LAST_NAMES.includes(getStringField(user, 'last_name')?.toLowerCase() ?? '')

	return titleMatch || nameMatch
}

/**
 * Sets the superuser email, password and status based on environment variables.
 * Superusers will get environment-specific configuration for security.
 *
 * @param user - A partial user object to handle
 * @param env - Environment variables containing defaults
 * @returns The modified user object with superuser configuration applied
 */
const handleSuperUser = (user: SeedItem, env: EnvironmentConfig): SeedItem => {
	return {
		...toSeedRecord(user),
		// Use the validated email
		email: env.DEFAULT_EMAIL,
		// Use the validated password
		password: env.DEFAULT_PASSWORD,
		// Active in development, suspended in production for security
		status: env.DEPLOYMENT_ENV === 'development' ? 'active' : 'suspended',
	}
}

/**
 * Preserves explicit TFA enforcement so development extraction retains the seed setting.
 * Additionally requires TFA for policies granting admin or Studio access in production.
 *
 * @param policy - A partial policy object to handle
 * @param env - Environment variables containing deployment environment
 * @returns The modified policy object with TFA enforcement applied
 */
export const handlePolicyTFA = (
	policy: SeedItem,
	env: Pick<SeederOptions, 'DEPLOYMENT_ENV'>,
): SeedItem => {
	return {
		...toSeedRecord(policy),
		enforce_tfa:
			toSeedRecord(policy).enforce_tfa === true ||
			(env.DEPLOYMENT_ENV === 'production' &&
				(toSeedRecord(policy).admin_access === true ||
					toSeedRecord(policy).app_access === true)),
	}
}

/**
 * Utility function to find collection data by name from the loaded collection data.
 * Provides type-safe access to collection data with proper return typing.
 *
 * @param systemCollectionData - Array of all loaded collection data
 * @param collectionName - Name of the collection to find
 * @returns Typed array of items for the specified collection, empty if not found
 */
const findCollectionData = (
	systemCollectionData: SystemCollectionData[],
	collectionName: SystemCollectionKey,
): SeedItem[] => {
	// Find the collection in the loaded data
	const collection = systemCollectionData.find((c) => c.collection === collectionName)

	// Return data with proper typing, empty array if not found
	return collection?.data ?? []
}

//
// Note: All previous complex nested resolution helpers for flows, policies, roles,
// and access/permission/operation reference resolving have been removed as we now
// import these tables directly from JSON without nesting.
//

/**
 * Creates the data provider for policies with environment-based TFA enforcement.
 *
 * @param systemCollectionData - All loaded collection data
 * @param env - Environment configuration for TFA handling
 * @returns CollectionDataProvider for policies
 */
const createPolicyDataProvider = (
	systemCollectionData: SystemCollectionData[],
	env: EnvironmentConfig,
): CollectionDataProvider => {
	const policyData = findCollectionData(systemCollectionData, 'directus_policies')

	return createCollectionDataProvider('directus_policies', () =>
		policyData.map((policy) => handlePolicyTFA(policy, env)),
	)
}

/**
 * Creates the data provider for users with environment-based superuser handling.
 *
 * @param systemCollectionData - All loaded collection data for lookups
 * @param env - Environment configuration for superuser handling
 * @returns CollectionDataProvider for users with minimal processing
 */
const createUserDataProvider = (
	systemCollectionData: SystemCollectionData[],
	env: EnvironmentConfig,
): CollectionDataProvider => {
	// Get users data from loaded collections
	const userData = findCollectionData(systemCollectionData, 'directus_users')

	return createCollectionDataProvider('directus_users', () =>
		userData.map((user) =>
			// Apply superuser configuration if needed; otherwise return as-is
			isSuperUser(user) ? handleSuperUser(user, env) : user,
		),
	)
}

/**
 * Determines if a flow should be filtered based on environment and naming pattern.
 * Development-only flows (containing [Dev] in name) are filtered in staging/production.
 *
 * @param flowName - Name of the flow to check
 * @param env - Environment configuration
 * @returns True if flow should be filtered out (not seeded)
 */
const shouldFilterFlowForEnvironment = (flowName: unknown, env: EnvironmentConfig): boolean => {
	if (!flowName) return false

	// In development: allow all flows
	if (env.DEPLOYMENT_ENV === 'development') return false

	// In staging/production: filter flows containing [Dev]
	return FLOW_DEVELOPMENT_PATTERN.test(seedStringSchema.parse(flowName))
}

/**
 * Creates special data providers for collections requiring custom handling.
 * Special collections have complex nested relationships that need manual processing.
 *
 * @param systemCollectionData - All loaded collection data
 * @param env - Environment configuration
 * @returns Array of data providers for special collections
 */
const createSpecialDataProviders = (
	systemCollectionData: SystemCollectionData[],
	env: EnvironmentConfig,
): CollectionDataProvider[] => {
	const specialProviders: CollectionDataProvider[] = []

	// Process each collection that requires special handling
	systemCollectionData
		.filter((collection) => isSpecialCollection(collection.collection))
		.forEach((collection) => {
			// Create an appropriate data provider based on the collection type
			switch (collection.collection) {
				case 'directus_flows': {
					const flowsData = findCollectionData(systemCollectionData, 'directus_flows')

					// Filter flows based on environment and naming pattern
					const filteredFlows = flowsData.filter(
						(flow) => !shouldFilterFlowForEnvironment(toSeedRecord(flow).name, env),
					)

					// Log filtering results for transparency
					const filteredCount = flowsData.length - filteredFlows.length
					if (filteredCount > 0) {
						// @todo: replace console.* with logger.*
						console.log(
							`Filtered ${filteredCount} development-only flow(s) for ${env.DEPLOYMENT_ENV ?? 'unknown'} environment`,
						)
					}

					specialProviders.push(
						createCollectionDataProvider('directus_flows', () => filteredFlows),
					)
					break
				}
				case 'directus_operations': {
					const operationsData = findCollectionData(
						systemCollectionData,
						'directus_operations',
					)
					const flowsData = findCollectionData(systemCollectionData, 'directus_flows')

					// Collect IDs of flows that should be filtered out
					const filteredFlowIds = new Set<unknown>(
						flowsData
							.filter((flow) =>
								shouldFilterFlowForEnvironment(toSeedRecord(flow).name, env),
							)
							.map((flow) => toSeedRecord(flow).id)
							.filter((id): id is string => typeof id === 'string'),
					)

					// Filter out operations that belong to filtered flows
					const filteredOperations = operationsData.filter(
						(op) => !filteredFlowIds.has(toSeedRecord(op).flow),
					)

					// Log filtering results
					const filteredOpsCount = operationsData.length - filteredOperations.length
					if (filteredOpsCount > 0) {
						// @todo: replace console.* with logger.*
						console.log(
							`Filtered ${filteredOpsCount} operation(s) belonging to development-only flows`,
						)
					}

					// Two-pass import to satisfy FK constraints between operations
					const [operationsWithoutRefs, referencesMap] =
						prepareOperationsForTwoPassImport(filteredOperations)

					// Pass 1: create operations without resolve/reject references
					specialProviders.push(
						createCollectionDataProvider(
							'directus_operations',
							() => operationsWithoutRefs,
						),
					)

					// Pass 2: update operations to set resolve/reject once they all exist
					if (referencesMap.size > 0) {
						const updates = createOperationUpdates(referencesMap)
						specialProviders.push(
							createCollectionDataProvider('directus_operations', () => updates),
						)
					}
					break
				}
				case 'directus_policies':
					specialProviders.push(createPolicyDataProvider(systemCollectionData, env))
					break
				case 'directus_users':
					specialProviders.push(createUserDataProvider(systemCollectionData, env))
					break
			}
		})

	return specialProviders
}

/**
 * Creates base data providers for collections that can be seeded directly.
 * Base collections don't require special processing and can use their data as-is.
 *
 * @param systemCollectionData - All loaded collection data
 * @returns Array of data providers for base collections
 */
const createBaseDataProviders = (
	systemCollectionData: SystemCollectionData[],
): CollectionDataProvider[] => {
	return (
		systemCollectionData
			// Filter out excluded and special collections
			.filter(
				(collection) =>
					!isExcludedCollection(collection.collection) &&
					!isSpecialCollection(collection.collection),
			)
			// Create simple data providers that return data as-is
			.map((collection) =>
				createCollectionDataProvider(collection.collection, () => collection.data),
			)
	)
}

/**
 * Sorts data providers according to the collection order defined in SYSTEM_COLLECTIONS_ORDER.
 * This ensures collections are seeded in the correct dependency order.
 *
 * @param dataProviders - Array of data providers to sort
 * @returns Sorted array of data providers
 */
const sortDataProviders = (dataProviders: CollectionDataProvider[]): CollectionDataProvider[] => {
	return dataProviders.sort((a, b) => {
		// Get index positions from the defined order
		const indexA = SYSTEM_COLLECTIONS_ORDER.indexOf(a.collectionName)
		const indexB = SYSTEM_COLLECTIONS_ORDER.indexOf(b.collectionName)

		// Sort by index position (earlier in order = lower index = comes first)
		return indexA - indexB
	})
}

/**
 * Get data providers for system collections.
 *
 * This is the main entry point for loading and processing system Directus collections.
 * It fetches extracted seed data from the seeds folder for each system collection
 * and maps each collection to a data provider function that returns the processed data.
 *
 * The function handles two types of collections:
 * 1. Special collections: Require custom processing for nested relationships
 * 2. Base collections: Can be seeded directly with minimal processing
 *
 * Special collections currently include operations (two-pass import),
 * policies (environment-based TFA enforcement), and users (environment-based
 * superuser configuration).
 *
 * @param env - Environment variables for configuration (admin defaults, deployment type)
 * @param selectedCollections - Collection names selected by the resolved include/exclude settings
 * @returns Selected providers in dependency order, or null when no supported files exist
 * @throws Error if data provider creation fails
 */
export const getDataProviders = async (
	env: SeederOptions,
	selectedCollections: string[] = SYSTEM_COLLECTIONS_ORDER,
): Promise<CollectionDataProvider[] | null> => {
	try {
		// Get seeds folder path from environment configuration
		const { seedsFolder } = getFolderPaths(env)

		// Operations need Flow names and IDs for [dev] filtering outside exact development.
		const requiredCollections =
			selectedCollections.includes('directus_operations') &&
			env.DEPLOYMENT_ENV !== 'development'
				? [...selectedCollections, 'directus_flows']
				: selectedCollections
		const systemCollectionData = await getSystemCollectionData(seedsFolder, requiredCollections)
		if (systemCollectionData === null) return null

		// Create data providers for special collections (complex processing)
		const specialDataProviders = createSpecialDataProviders(systemCollectionData, env)

		// Create data providers for base collections (simple processing)
		const baseDataProviders = createBaseDataProviders(systemCollectionData)

		// Combine all data providers
		const allDataProviders = [...specialDataProviders, ...baseDataProviders]

		// Sort by dependency order and return
		return sortDataProviders(
			allDataProviders.filter((provider) =>
				selectedCollections.includes(provider.collectionName),
			),
		)
	} catch (error) {
		// Handle any errors in the data provider creation process
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		// @todo: replace console.* with logger.*
		console.error(`Failed to create data providers: ${errorMessage}`)
		throw new Error(`Data provider creation failed: ${errorMessage}`)
	}
}
