import type { ApiCollection, ApiExtensionContext, Relation, SchemaOverview } from '@directus/types'
import type { LockProvider } from '../lock'
import type { LoggerLike } from '../logger'

import { attempt } from '../../shared/attempt'
import { createMemoryLockProvider } from '../lock'
import { getSchemaLockName, type SchemaChangeOptions } from './config'
import { createSchemaChangeLockProvider } from './provider'

/** Portable Directus schema data shipped by an extension. */
export interface DirectusSchemaDefinition {
	collections: CollectionDefinition[]
	fields: FieldDefinition[]
	relations: RelationDefinition[]
}

type Database = ApiExtensionContext['database']
type Services = ApiExtensionContext['services']
type CollectionsService = InstanceType<Services['CollectionsService']>
type FieldsService = InstanceType<Services['FieldsService']>
type RelationsService = InstanceType<Services['RelationsService']>
type ServiceOptions = ConstructorParameters<Services['CollectionsService']>[0]
type CollectionDefinition = Parameters<CollectionsService['createOne']>[0]
type FieldDefinition = Parameters<FieldsService['createField']>[1]
type RelationDefinition = Partial<Relation>

/** Options for one schema ensure operation. */
export interface EnsureDirectusSchemaOptions {
	/** Whether to coordinate the operation with a shared lock. */
	useLockedSchemaChange?: boolean
	/** Whether unexpected schema service failures should be rethrown. */
	abortOnError?: boolean
	/** Lock provider selected by the consumer. */
	lockProvider?: LockProvider
	/** Validated environment configuration used when no provider is supplied directly. */
	lockProviderConfig?: SchemaChangeOptions
	/** Lock lease duration in milliseconds. */
	lockLeaseMs?: number
}

/** Arguments accepted by ensureDirectusSchema. */
export interface EnsureDirectusSchemaInput {
	extensionId: string
	database: Database
	getSchema: (options?: { database?: Database; bypassCache?: boolean }) => Promise<SchemaOverview>
	logger: LoggerLike
	definition: DirectusSchemaDefinition
	services: Services
	options?: EnsureDirectusSchemaOptions
}

/** Result of one schema ensure operation. */
export interface EnsureDirectusSchemaResult {
	changed: string[]
	skipped: boolean
}

const fallbackLockProvider = createMemoryLockProvider()

/**
 * Releases no resources for a provider owned by the caller or fallback provider.
 * @returns A resolved promise.
 */
const disposeNoop = (): Promise<void> => Promise.resolve()

/**
 * Builds constructor options for a Directus schema service.
 * @param database - Directus database connection.
 * @param schema - Current Directus schema overview.
 * @returns Service constructor options.
 */
const serviceOptions = (database: Database, schema: SchemaOverview): ServiceOptions => ({
	knex: database,
	accountability: null,
	schema,
})

/**
 * Reads a collection and treats a missing resource as absent.
 * @param service - Directus collections service.
 * @param collection - Collection definition.
 * @returns Existing collection metadata or null.
 */
const getCollection = async (
	service: CollectionsService,
	collection: CollectionDefinition,
): Promise<ApiCollection | null> => {
	const result = await attempt(() => service.readOne(collection.collection))
	return result.error === null ? result.data : null
}

/**
 * Logs an incompatible existing resource without modifying it.
 * @param logger - Logger used for the loud compatibility warning.
 * @param resource - Resource kind and identifier.
 * @param details - Compatibility details.
 * @returns Nothing.
 */
const logIncompatible = (
	logger: LoggerLike,
	resource: string,
	details: Record<string, unknown>,
): null => {
	logger.error({
		msg: 'Incompatible Directus schema resource; preserving the existing resource',
		resource,
		...details,
	})
	return null
}

/**
 * Creates a collection when it does not already exist.
 * @param service - Directus collections service.
 * @param collection - Collection definition.
 * @param logger - Logger used for operational changes.
 * @returns Change identifier or null when already present or incompatible.
 */
const ensureCollection = async (
	service: CollectionsService,
	collection: CollectionDefinition,
	logger: LoggerLike,
): Promise<string | null> => {
	const existing = await getCollection(service, collection)
	if (existing) {
		logger.info({
			msg: '⏭️ Directus collection already exists',
			collection: collection.collection,
		})
		return null
	}

	await service.createOne(collection)
	logger.info({ msg: '🛠️ Created Directus collection', collection: collection.collection })
	return 'collection:' + collection.collection
}

/**
 * Creates a field when it does not already exist.
 * @param service - Directus fields service.
 * @param field - Field definition.
 * @param schema - Current Directus schema overview.
 * @param logger - Logger used for operational changes.
 * @returns Change identifier or null when already present or incompatible.
 */
const ensureField = async (
	service: FieldsService,
	field: FieldDefinition,
	schema: SchemaOverview,
	logger: LoggerLike,
): Promise<string | null> => {
	if (!field.collection) {
		return logIncompatible(logger, 'field', {
			collection: field.collection,
			field: field.field,
			reason: 'field collection is required',
		})
	}

	const existing = schema.collections[field.collection]?.fields[field.field]
	if (existing) {
		if (existing.type === field.type) {
			logger.info({
				msg: '⏭️ Directus field already exists and is compatible',
				collection: field.collection,
				field: field.field,
				type: field.type,
			})
			return null
		}
		return logIncompatible(logger, 'field:' + field.collection + '.' + field.field, {
			expectedType: field.type,
			actualType: existing.type,
		})
	}

	await service.createField(field.collection, field)
	logger.info({
		msg: '🛠️ Created Directus field',
		collection: field.collection,
		field: field.field,
	})
	return 'field:' + field.collection + '.' + field.field
}

/**
 * Creates a relation when it does not already exist.
 * @param service - Directus relations service.
 * @param relation - Relation definition.
 * @param schema - Current Directus schema overview.
 * @param logger - Logger used for operational changes.
 * @returns Change identifier or null when already present or incompatible.
 */
const ensureRelation = async (
	service: RelationsService,
	relation: RelationDefinition,
	schema: SchemaOverview,
	logger: LoggerLike,
): Promise<string | null> => {
	if (!relation.collection || !relation.field || !relation.related_collection) {
		return logIncompatible(logger, 'relation', {
			collection: relation.collection,
			field: relation.field,
			relatedCollection: relation.related_collection,
			reason: 'relation endpoints are required',
		})
	}

	const existing = schema.relations.find(
		(candidate) =>
			candidate.collection === relation.collection && candidate.field === relation.field,
	)
	if (existing) {
		if (existing.related_collection === relation.related_collection) {
			logger.info({
				msg: '⏭️ Directus relation already exists and is compatible',
				collection: relation.collection,
				field: relation.field,
				relatedCollection: relation.related_collection,
			})
			return null
		}
		return logIncompatible(logger, 'relation:' + relation.collection + '.' + relation.field, {
			expectedRelatedCollection: relation.related_collection,
			actualRelatedCollection: existing.related_collection,
		})
	}

	await service.createOne(relation)
	logger.info({
		msg: '🛠️ Created Directus relation',
		collection: relation.collection,
		field: relation.field,
		relatedCollection: relation.related_collection,
	})
	return 'relation:' + relation.collection + '.' + relation.field
}

/**
 * Ensures that an extension's portable Directus schema exists and is compatible.
 *
 * Compatibility intentionally covers only structural invariants: collection existence, field
 * identity/type, and relation endpoints. UI metadata such as labels, icons, visibility, and
 * interfaces is not authoritative and is never overwritten.
 *
 * @param input - Schema definition, Directus services, and operation options.
 * @returns The resources created by the operation.
 */
export async function ensureDirectusSchema(
	input: EnsureDirectusSchemaInput,
): Promise<EnsureDirectusSchemaResult> {
	const { extensionId, database, getSchema, logger, definition, services } = input
	const options = input.options ?? {}
	const changed: string[] = []
	const startedAt = Date.now()
	const lockEnabled = options.useLockedSchemaChange === true
	const lockProviderName = options.lockProvider
		? 'custom'
		: (options.lockProviderConfig?.DIRECTUS_EXTENSIONS_LOCK_PROVIDER ?? 'MEMORY')
	let currentPhase = 'initialization'
	let currentResource: string | undefined

	logger.info({
		msg: '🚀 Starting Directus schema ensure',
		extensionId,
		resources: {
			collections: definition.collections.length,
			fields: definition.fields.length,
			relations: definition.relations.length,
		},
		locking: lockEnabled,
		lockProvider: lockProviderName,
	})

	const configuredProvider = options.lockProvider
		? {
				provider: options.lockProvider,
				dispose: disposeNoop,
			}
		: options.lockProviderConfig && options.useLockedSchemaChange
			? createSchemaChangeLockProvider(options.lockProviderConfig)
			: {
					provider: fallbackLockProvider,
					dispose: disposeNoop,
				}
	const lockProvider = configuredProvider.provider
	let lease = null

	try {
		if (options.useLockedSchemaChange) {
			if (!options.lockProvider && !options.lockProviderConfig) {
				logger.warn({
					msg: 'Using a process-local schema lock; configure a shared provider for replicas',
					extensionId,
				})
			}
			lease = await lockProvider.tryAcquire(getSchemaLockName(extensionId), {
				...(options.lockLeaseMs === undefined ? {} : { leaseMs: options.lockLeaseMs }),
			})
			if (!lease) {
				logger.info({
					msg: '🔒 Skipped schema ensure; another operation holds the lock',
					extensionId,
					lockProvider: lockProviderName,
				})
				return { changed, skipped: true }
			}
			logger.info({
				msg: '🔐 Acquired schema ensure lock',
				extensionId,
				lockProvider: lockProviderName,
			})
		}

		const result = await attempt(async () => {
			currentPhase = 'schema read'
			const schema = await getSchema({ database, bypassCache: true })
			const serviceOptionsValue = serviceOptions(database, schema)
			const collectionService = new services.CollectionsService(serviceOptionsValue)
			const fieldService = new services.FieldsService(serviceOptionsValue)
			const relationService = new services.RelationsService(serviceOptionsValue)

			for (const collection of definition.collections) {
				currentPhase = 'collection'
				currentResource = collection.collection
				const created = await ensureCollection(collectionService, collection, logger)
				if (created) changed.push(created)
			}
			for (const field of definition.fields) {
				currentPhase = 'field'
				currentResource = field.collection + '.' + field.field
				const created = await ensureField(fieldService, field, schema, logger)
				if (created) changed.push(created)
			}
			for (const relation of definition.relations) {
				currentPhase = 'relation'
				currentResource = relation.collection + '.' + relation.field
				const created = await ensureRelation(relationService, relation, schema, logger)
				if (created) changed.push(created)
			}
		})

		if (result.error !== null) {
			logger.error({
				msg: '❌ Directus schema ensure failed',
				extensionId,
				phase: currentPhase,
				resource: currentResource,
				cause: result.error,
			})
			if (options.abortOnError ?? true) {
				const error =
					result.error instanceof Error
						? result.error
						: new Error(JSON.stringify(result.error) ?? 'Unknown schema ensure failure')
				throw error
			}
			logger.warn({
				msg: '⚠️ Continuing after schema ensure failure',
				extensionId,
				phase: currentPhase,
				resource: currentResource,
			})
		}

		logger.info({
			msg: '✅ Directus schema ensure completed',
			extensionId,
			changed,
			changedCount: changed.length,
			durationMs: Date.now() - startedAt,
		})
		return { changed, skipped: false }
	} finally {
		if (lease) {
			await lease.release()
			logger.info({ msg: '🔓 Released schema ensure lock', extensionId })
		}
		if (!options.lockProvider) await configuredProvider.dispose()
	}
}
