import type { EventContext } from '@directus/types'

import { defineHook } from '@directus/extensions-sdk'
import {
	ensureDirectusPolicy,
	ensureDirectusSchema,
	validatePolicyDefinition,
	validateSchemaDefinition,
	createDirectusStartupCoordinator,
	extensionSetup,
	validateExtensionOptions,
	withCollectionIdentity,
} from '@onderwijsin/directus-extension-utils/server'

import redirectPolicies from '../../schema/policies.json'
import redirectSchema from '../../schema/redirects.json'
import { EXTENSION_NAME } from '../shared/constants'
import { discoverCollectionConfiguration } from '../shared/ordering'
import { envSchema } from './env.schema'
import { coordinateMutation } from './mutation-coordinator'
import {
	canonicalUrlForItem,
	planArchiveReactivation,
	planCanonicalRedirect,
	planLifecycleDeactivation,
	selectRedirectSource,
} from './redirect-planner'
import {
	applyRedirectLifecyclePlan,
	applyRedirectPlan,
	readManagedRedirectsForItem,
	readRelevantRedirects,
} from './redirect-service'

/**
 * Collects the minimum field set required by the mutation coordinator.
 * @param configuration - Parsed collection configuration.
 * @returns Deduplicated later-read candidates.
 */
function relevantFields(
	configuration: ReturnType<typeof discoverCollectionConfiguration>,
): string[] {
	return [
		...configuration.slugs.flatMap((field) => [field.field, ...field.options.sourceFields]),
		...configuration.permalinks.flatMap((field) => [
			field.field,
			...(field.options.slugField ? [field.options.slugField] : []),
		]),
	]
}

/**
 * Registers the Sluggernaut server lifecycle.
 *
 * Derives configured fields and coordinates redirect history across item mutations.
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @returns void
 */
export default defineHook(function registerSluggernautHook(hook, context) {
	const setup = extensionSetup(EXTENSION_NAME, context.env, context.logger)
	setup.start()

	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(context.env, envSchema, context.logger)
	const startup = createDirectusStartupCoordinator(hook.action, context.logger, {
		id: EXTENSION_NAME,
		name: 'Sluggernaut',
		disabled: !options.SLUGGERNAUT_SCHEMA_CHANGES_ENABLED,
		disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
		dataDisabledGlobally: !options.DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED,
		lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_NAME },
	})
	startup.schema(async ({ lockProvider }) => {
		await ensureDirectusSchema({
			id: EXTENSION_NAME,
			database: context.database,
			getSchema: context.getSchema,
			logger: context.logger,
			services: context.services,
			definition: withCollectionIdentity(
				options.SLUGGERNAUT_REDIRECTS_COLLECTION,
				validateSchemaDefinition(redirectSchema),
			),
			options: { lockProvider, abortOnError: options.SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR },
		})
	})
	startup.data(async ({ lockProvider }) => {
		if (
			!options.SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED &&
			!options.SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED
		)
			return

		const schema = await context.getSchema()
		const collectionsService = new context.services.CollectionsService({
			schema,
			accountability: null,
			knex: context.database,
		})
		try {
			await collectionsService.readOne(options.SLUGGERNAUT_REDIRECTS_COLLECTION)
		} catch {
			context.logger.warn(
				'Sluggernaut policy registration skipped; redirect collection is unavailable.',
				{
					collection: options.SLUGGERNAUT_REDIRECTS_COLLECTION,
					code: 'redirect-collection-unavailable',
				},
			)
			return
		}

		const definitions = validatePolicyDefinition(redirectPolicies)
		const enabledPolicies = new Set(
			[
				options.SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED ? 'Can Manage Redirects' : null,
				options.SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED
					? 'Can Read Active Redirects'
					: null,
			].filter((name): name is string => name !== null),
		)
		for (const definition of definitions.policies) {
			if (!enabledPolicies.has(definition.name)) continue
			await ensureDirectusPolicy({
				id: EXTENSION_NAME,
				database: context.database,
				getSchema: context.getSchema,
				logger: context.logger,
				services: context.services,
				definition: {
					...definition,
					permissions: definition.permissions.map((permission) => ({
						...permission,
						collection: options.SLUGGERNAUT_REDIRECTS_COLLECTION,
					})),
				},
				options: { lockProvider, abortOnError: options.SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR },
			})
		}
	})

	/**
	 * Reads and validates field configuration for one collection.
	 * @param collection - Directus collection key.
	 * @returns Parsed collection configuration.
	 */
	async function discoverConfiguration(collection: string) {
		const schema = await context.getSchema()
		const fieldsService = new context.services.ItemsService('directus_fields', {
			schema,
			accountability: null,
		})
		const fields = await fieldsService.readByQuery({
			filter: { collection: { _eq: collection } },
			fields: ['field', 'meta'],
			limit: -1,
		})
		return discoverCollectionConfiguration(fields)
	}

	/**
	 * Reads Directus-native archive metadata for one collection.
	 * @param collection - Directus collection key.
	 * @returns Archive metadata when configured, otherwise null.
	 */
	async function discoverArchiveSettings(collection: string) {
		const schema = await context.getSchema()
		const collectionsService = new context.services.ItemsService('directus_collections', {
			schema,
			accountability: null,
		})
		const result = await collectionsService.readOne(collection, { fields: ['meta'] })
		if (!isRecord(result) || !isRecord(result.meta)) return null
		const meta = result.meta
		if (typeof meta.archive_field !== 'string') return null
		return {
			field: meta.archive_field,
			archiveValue: meta.archive_value,
			unarchiveValue: meta.unarchive_value,
		}
	}

	/**
	 * Reads only fields required for the current derivation.
	 * @param collection - Directus collection key.
	 * @param key - Item primary key.
	 * @param fields - Required field keys.
	 * @param database - Event transaction database handle.
	 * @returns Existing item values.
	 */
	async function readExistingItem(
		collection: string,
		key: string | number,
		fields: readonly string[],
		database: EventContext['database'],
	) {
		const schema = await context.getSchema()
		const itemsService = new context.services.ItemsService(collection, {
			schema,
			accountability: null,
			knex: database,
		})
		const item = await itemsService.readOne(key, { fields: [...new Set(fields)] })
		if (!isRecord(item)) throw new Error('Sluggernaut could not read the existing item.')
		return item
	}

	/**
	 * Emits structured warnings for invalid or duplicate field configuration.
	 * @param collection - Directus collection key.
	 * @param configuration - Parsed collection configuration.
	 * @returns void
	 */
	function logConfigurationWarnings(
		collection: string,
		configuration: ReturnType<typeof discoverCollectionConfiguration>,
	) {
		for (const warning of configuration.warnings) {
			context.logger.warn(warning.message, {
				collection,
				field: warning.field,
				code: warning.code,
			})
		}
	}

	/**
	 * Checks whether the payload can affect a Sluggernaut-derived value.
	 * @param payload - Incoming mutation payload.
	 * @param configuration - Parsed collection configuration.
	 * @returns Whether a relevant field is present.
	 */
	function hasRelevantPayloadField(
		payload: Readonly<Record<string, unknown>>,
		configuration: ReturnType<typeof discoverCollectionConfiguration>,
	): boolean {
		return relevantFields(configuration).some((field) => Object.hasOwn(payload, field))
	}

	/**
	 * Narrows Directus payloads and service results to plain records.
	 * @param value - Unknown Directus value.
	 * @returns Whether the value is a non-array object record.
	 */
	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value)
	}

	/**
	 * Processes redirect history for one canonical transition.
	 * @param collection - Source collection.
	 * @param key - Source item key.
	 * @param existingItem - Previous item state.
	 * @param nextItem - Resulting item state.
	 * @param configuration - Parsed collection configuration.
	 * @param database - Event transaction database handle.
	 * @returns void
	 */
	async function processRedirects(
		collection: string,
		key: string | number,
		existingItem: Readonly<Record<string, unknown>>,
		nextItem: Readonly<Record<string, unknown>>,
		configuration: ReturnType<typeof discoverCollectionConfiguration>,
		database: EventContext['database'],
	) {
		if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
		const source = selectRedirectSource(configuration)
		if (source === null) return
		const oldCanonical = canonicalUrlForItem(source, existingItem)
		const newCanonical = canonicalUrlForItem(source, nextItem)
		if (oldCanonical === null || newCanonical === null || oldCanonical === newCanonical) return

		const schema = await context.getSchema()
		const store = new context.services.ItemsService(options.SLUGGERNAUT_REDIRECTS_COLLECTION, {
			schema,
			accountability: null,
			knex: database,
		})
		const existingRedirects = await readRelevantRedirects(store, oldCanonical, newCanonical)
		const plan = planCanonicalRedirect({
			oldCanonical,
			newCanonical,
			source,
			sourceCollection: collection,
			sourceItem: String(key),
			existingRedirects,
		})
		for (const warning of plan.warnings) {
			context.logger.warn(warning, {
				collection,
				field: source.field,
				code: 'redirect-conflict',
			})
		}
		await applyRedirectPlan(store, plan)
	}

	/**
	 * Deactivates managed redirect history after source-item deletion.
	 * @param collection - Deleted source collection.
	 * @param keys - Deleted item keys.
	 * @param database - Event transaction database handle.
	 * @returns void
	 */
	async function processDeletedItems(
		collection: string,
		keys: readonly (string | number)[],
		database: EventContext['database'],
	) {
		if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
		const schema = await context.getSchema()
		const store = new context.services.ItemsService(options.SLUGGERNAUT_REDIRECTS_COLLECTION, {
			schema,
			accountability: null,
			knex: database,
		})

		for (const key of keys) {
			const redirects = await readManagedRedirectsForItem(store, collection, String(key))
			await applyRedirectLifecyclePlan(store, {
				deactivate: planLifecycleDeactivation(redirects, 'delete'),
				reactivate: [],
			})
		}
	}

	/**
	 * Applies archive lifecycle changes to one source item.
	 * @param collection - Source collection.
	 * @param key - Source item key.
	 * @param lifecycle - Archive lifecycle transition.
	 * @param database - Event transaction database handle.
	 * @returns void
	 */
	async function processArchiveLifecycle(
		collection: string,
		key: string | number,
		lifecycle: 'archive' | 'unarchive',
		database: EventContext['database'],
	) {
		if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
		const schema = await context.getSchema()
		const store = new context.services.ItemsService(options.SLUGGERNAUT_REDIRECTS_COLLECTION, {
			schema,
			accountability: null,
			knex: database,
		})
		const redirects = await readManagedRedirectsForItem(store, collection, String(key))
		await applyRedirectLifecyclePlan(store, {
			deactivate:
				lifecycle === 'archive' ? planLifecycleDeactivation(redirects, 'archive') : [],
			reactivate: lifecycle === 'unarchive' ? planArchiveReactivation(redirects) : [],
		})
	}

	hook.filter('items.create', async (payload, meta) => {
		if (!isRecord(payload)) return payload
		const collection = meta.collection
		if (typeof collection !== 'string')
			throw new Error('Sluggernaut requires a collection key.')

		const configuration = await discoverConfiguration(collection)
		logConfigurationWarnings(collection, configuration)
		if (configuration.slugs.length === 0 && configuration.permalinks.length === 0)
			return payload

		return coordinateMutation({
			kind: 'create',
			payload,
			existingItem: {},
			configuration,
		}).payload
	})

	hook.filter('items.update', async (payload, meta, eventContext) => {
		if (!isRecord(payload)) return payload
		const collection = meta.collection
		if (typeof collection !== 'string')
			throw new Error('Sluggernaut requires a collection key.')

		const configuration = await discoverConfiguration(collection)
		const archiveSettings = await discoverArchiveSettings(collection)
		const archiveFieldChanged =
			archiveSettings !== null && Object.hasOwn(payload, archiveSettings.field)
		const hasRelevantFields = hasRelevantPayloadField(payload, configuration)
		if (
			configuration.slugs.length === 0 &&
			configuration.permalinks.length === 0 &&
			!archiveFieldChanged
		)
			return payload
		if (!hasRelevantFields && !archiveFieldChanged) return payload
		if (meta.keys.length > 1) {
			throw new Error(
				'Sluggernaut cannot derive or archive items in an ambiguous bulk mutation.',
			)
		}

		const key = meta.keys[0]
		if (typeof key !== 'string' && typeof key !== 'number') {
			throw new Error('Sluggernaut requires a scalar item key for updates.')
		}

		const existingItem = await readExistingItem(
			collection,
			key,
			[
				...relevantFields(configuration),
				...(archiveSettings === null ? [] : [archiveSettings.field]),
			],
			eventContext.database,
		)
		if (archiveSettings !== null && archiveFieldChanged) {
			const previousValue = existingItem[archiveSettings.field]
			const nextValue = payload[archiveSettings.field]
			const lifecycle =
				nextValue === archiveSettings.archiveValue &&
				previousValue !== archiveSettings.archiveValue
					? 'archive'
					: nextValue === archiveSettings.unarchiveValue &&
						  previousValue === archiveSettings.archiveValue
						? 'unarchive'
						: null
			if (lifecycle !== null) {
				await processArchiveLifecycle(
					collection,
					key,
					lifecycle,
					eventContext.database,
				).catch((error: unknown) => {
					context.logger.warn('Sluggernaut archive redirect processing was skipped.', {
						collection,
						error: error instanceof Error ? error.message : String(error),
						code: 'redirect-archive-processing-failed',
					})
				})
			}
		}
		if (!hasRelevantFields) return payload
		const result = coordinateMutation({
			kind: 'update',
			payload,
			existingItem,
			configuration,
		})
		await processRedirects(
			collection,
			key,
			existingItem,
			{ ...existingItem, ...result.payload },
			configuration,
			eventContext.database,
		).catch((error: unknown) => {
			context.logger.warn('Sluggernaut redirect processing was skipped.', {
				collection,
				error: error instanceof Error ? error.message : String(error),
				code: 'redirect-processing-failed',
			})
		})

		return result.payload
	})

	hook.action('items.delete', (meta, eventContext) => {
		const deleteMeta = isRecord(meta) ? meta : {}
		const collection = deleteMeta.collection
		if (typeof collection !== 'string') return
		const keys = (Array.isArray(deleteMeta.keys) ? deleteMeta.keys : []).filter(
			(key): key is string | number => typeof key === 'string' || typeof key === 'number',
		)
		if (keys.length === 0) return

		void processDeletedItems(collection, keys, eventContext.database).catch(
			(error: unknown) => {
				context.logger.warn('Sluggernaut delete redirect processing was skipped.', {
					collection,
					error: error instanceof Error ? error.message : String(error),
					code: 'redirect-delete-processing-failed',
				})
			},
		)
	})
	setup.end()
})
