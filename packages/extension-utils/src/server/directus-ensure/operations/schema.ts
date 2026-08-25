import type {
	ApiCollection,
	Field,
	RawCollection,
	RawField,
	Relation,
	SchemaOverview,
} from '@directus/types'

import { attempt } from '../../../shared/attempt'
import { isNonBlankString } from '../../../shared/guards'
import { getDirectusStartupLockName } from '../config'
import {
	resolveDirectusLockProvider,
	type EnsureDirectusSchemaInput,
	type EnsureDirectusSchemaOptions,
	type EnsureDirectusSchemaResult,
} from './core'

type Database = EnsureDirectusSchemaInput['database']
type Services = EnsureDirectusSchemaInput['services']
type CollectionsService = InstanceType<Services['CollectionsService']>
type FieldsService = InstanceType<Services['FieldsService']>
type RelationsService = InstanceType<Services['RelationsService']>
type ServiceOptions = ConstructorParameters<Services['CollectionsService']>[0]
type RelationDefinition = Partial<Relation>
type FieldMutation = Pick<Field, 'field' | 'type'> & Partial<Omit<Field, 'field' | 'type'>>

/**
 * Builds constructor options for a Directus schema service.
 * @param database - Directus database connection.
 * @param schema - Current schema overview.
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
	collection: RawCollection,
): Promise<ApiCollection | null> => {
	const result = await attempt(() => service.readOne(collection.collection))
	return result.error === null ? result.data : null
}

/**
 * Logs an incompatible existing schema resource without modifying it.
 * @param logger - Logger used for the compatibility warning.
 * @param resource - Resource kind and identifier.
 * @param details - Compatibility details.
 * @returns Null to indicate that no resource was created.
 */
const logIncompatible = (
	logger: EnsureDirectusSchemaInput['logger'],
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
 * @param logger - Logger used for operational details.
 * @returns Change identifier or null.
 */
const ensureCollection = async (
	service: CollectionsService,
	collection: RawCollection,
	logger: EnsureDirectusSchemaInput['logger'],
): Promise<string | null> => {
	if (
		!isNonBlankString(collection.schema?.name) ||
		!collection.fields?.some((field) => field.schema?.is_primary_key)
	) {
		return logIncompatible(logger, 'collection:' + collection.collection, {
			reason: 'collection schema name and primary key field are required',
		})
	}
	const existing = await getCollection(service, collection)
	if (existing) {
		logger.debug?.({
			msg: '⏭️ Directus collection already exists',
			collection: collection.collection,
		})
		return null
	}
	await service.createOne(collection)
	logger.debug?.({ msg: '🛠️ Created Directus collection', collection: collection.collection })
	return 'collection:' + collection.collection
}

/**
 * Creates a field when it does not already exist.
 * @param service - Directus fields service.
 * @param field - Field definition.
 * @param schema - Current schema overview.
 * @param logger - Logger used for operational details.
 * @returns Change identifier or null.
 */
const ensureField = async (
	service: FieldsService,
	field: RawField,
	schema: SchemaOverview,
	logger: EnsureDirectusSchemaInput['logger'],
): Promise<string | null> => {
	if (!field.collection) {
		return logIncompatible(logger, 'field', {
			collection: field.collection,
			field: field.field,
			reason: 'field collection is required',
		})
	}
	const collection = field.collection
	const existingFromSchema = schema.collections[collection]?.fields[field.field]
	const existing =
		existingFromSchema ?? (await attempt(() => service.readOne(collection, field.field))).data
	if (existing) {
		if (existing.type === field.type) {
			logger.debug?.({
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
	const { collection: _collection, ...payload } = field
	await service.createField(collection, payload as FieldMutation)
	logger.debug?.({
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
 * @param schema - Current schema overview.
 * @param logger - Logger used for operational details.
 * @returns Change identifier or null.
 */
const ensureRelation = async (
	service: RelationsService,
	relation: RelationDefinition,
	schema: SchemaOverview,
	logger: EnsureDirectusSchemaInput['logger'],
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
			logger.debug?.({
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
	logger.debug?.({
		msg: '🛠️ Created Directus relation',
		collection: relation.collection,
		field: relation.field,
		relatedCollection: relation.related_collection,
	})
	return 'relation:' + relation.collection + '.' + relation.field
}

/**
 * Ensures an extension's portable Directus schema exists and is compatible.
 * @param input - Schema definition, Directus services, and operation options.
 * @returns The resources created by the operation.
 */
export async function ensureDirectusSchema(
	input: EnsureDirectusSchemaInput,
): Promise<EnsureDirectusSchemaResult> {
	const { id, database, getSchema, logger, definition, services } = input
	const options: EnsureDirectusSchemaOptions = input.options ?? {}
	const changed: string[] = []
	const startedAt = Date.now()
	const lockProviderName = options.lockProvider
		? 'custom'
		: (options.lockProviderConfig?.DIRECTUS_EXTENSIONS_LOCK_PROVIDER ??
			options.lockProviderConfig?.SYNCHRONIZATION_STORE ??
			'memory')
	const nestedFieldCount = definition.collections.reduce(
		(count, collection) => count + (collection.fields?.length ?? 0),
		0,
	)
	let currentPhase = 'initialization'
	let currentResource: string | undefined

	logger.info({
		msg: '🚀 Starting Directus schema ensure',
		extensionId: id,
		resources: {
			collections: definition.collections.length,
			fields: definition.fields.length + nestedFieldCount,
			relations: definition.relations.length,
		},
		locking: true,
		lockProvider: lockProviderName,
	})

	const configuredProvider = resolveDirectusLockProvider(options)
	const lockProvider = configuredProvider.provider
	let lease = null

	try {
		// Acquire one startup lease before touching collections, fields, or relations.
		if (!options.lockProvider && !options.lockProviderConfig) {
			logger.warn({
				msg: 'Using a process-local schema lock; configure a shared provider for replicas',
				extensionId: id,
			})
		}
		lease = await lockProvider.tryAcquire(getDirectusStartupLockName(id), {
			...(options.lockLeaseMs === undefined ? {} : { leaseMs: options.lockLeaseMs }),
		})
		if (!lease) {
			logger.info({
				msg: '⏭️ Directus schema ensure skipped; another operation holds the lock',
				extensionId: id,
				lockProvider: lockProviderName,
				changed,
				changedCount: changed.length,
				skipped: true,
				durationMs: Date.now() - startedAt,
			})
			return { changed, skipped: true }
		}
		logger.debug?.({
			msg: '🔐 Acquired schema ensure lock',
			extensionId: id,
			lockProvider: lockProviderName,
		})

		// Refresh the schema between phases so each service sees the previous phase's changes.
		const result = await attempt(async () => {
			currentPhase = 'schema read'
			let schema = await getSchema({ database, bypassCache: true })
			const collectionService = new services.CollectionsService(
				serviceOptions(database, schema),
			)
			for (const collection of definition.collections) {
				currentPhase = 'collection'
				currentResource = collection.collection
				const created = await ensureCollection(collectionService, collection, logger)
				if (created) changed.push(created)
			}
			schema = await getSchema({ database, bypassCache: true })
			const fieldService = new services.FieldsService(serviceOptions(database, schema))
			for (const field of definition.fields) {
				currentPhase = 'field'
				currentResource = field.collection + '.' + field.field
				const created = await ensureField(fieldService, field, schema, logger)
				if (created) changed.push(created)
			}
			schema = await getSchema({ database, bypassCache: true })
			const relationService = new services.RelationsService(serviceOptions(database, schema))
			for (const relation of definition.relations) {
				currentPhase = 'relation'
				currentResource = relation.collection + '.' + relation.field
				const created = await ensureRelation(relationService, relation, schema, logger)
				if (created) changed.push(created)
			}
		})
		if (result.error !== null) {
			// Best-effort mode records the failure and continues; aborting mode rethrows it.
			logger.error({
				msg: '❌ Directus schema ensure failed',
				extensionId: id,
				phase: currentPhase,
				resource: currentResource,
				cause: result.error instanceof Error ? result.error.message : result.error,
			})
			if (options.abortOnError ?? true) {
				throw result.error instanceof Error
					? result.error
					: new Error(JSON.stringify(result.error) ?? 'Unknown schema ensure failure')
			}
			logger.warn({ msg: '⚠️ Continuing after schema ensure failure', extensionId: id })
		}
		logger.info({
			msg: '✅ Directus schema ensure completed',
			extensionId: id,
			changed,
			changedCount: changed.length,
			durationMs: Date.now() - startedAt,
		})
		return { changed, skipped: false }
	} finally {
		if (lease) {
			await lease.release()
			logger.debug?.({ msg: '🔓 Released schema ensure lock', extensionId: id })
		}
		if (!options.lockProvider) await configuredProvider.dispose()
	}
}

export type {
	DirectusSchemaDefinition,
	EnsureDirectusSchemaInput,
	EnsureDirectusSchemaOptions,
	EnsureDirectusSchemaResult,
} from './core'
