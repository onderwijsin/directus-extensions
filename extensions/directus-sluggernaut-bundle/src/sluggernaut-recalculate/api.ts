import { defineOperationApi } from '@directus/extensions-sdk'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_NAME } from '../shared/constants'
import { discoverCollectionConfiguration } from '../shared/ordering'
import { envSchema } from '../sluggernaut-hook/env.schema'
import { coordinateMutation } from '../sluggernaut-hook/mutation-coordinator'

interface RecalculateOptions {
	collection: string
	fieldKeys?: string[]
	createRedirects: boolean
}

interface RecalculateResult {
	processed: number
	updated: number
	skipped: number
	failed: number
}

const PAGE_SIZE = 100

/**
 * Narrows an unknown service result to an item record.
 * @param value - Service result to inspect.
 * @returns Whether the value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Resolves the strict recalculation allowlist.
 * @param options - Operation input.
 * @param configuration - Discovered collection configuration.
 * @returns Selected derived field keys.
 */
function selectedFieldKeys(
	options: RecalculateOptions,
	configuration: ReturnType<typeof discoverCollectionConfiguration>,
): ReadonlySet<string> {
	const derivedFields = [
		...configuration.slugs.map((field) => field.field),
		...configuration.permalinks
			.filter((field) => field.options.generateFromSlug)
			.map((field) => field.field),
	]
	if (options.fieldKeys === undefined) return new Set(derivedFields)

	const requested = new Set(options.fieldKeys)
	return new Set(derivedFields.filter((field) => requested.has(field)))
}

/**
 * Finds the collection primary key from Directus field metadata.
 * @param fields - Directus field service results.
 * @returns Primary key field name, or `id` when metadata is incomplete.
 */
function primaryKeyFromFields(fields: unknown): string {
	if (!Array.isArray(fields)) return 'id'
	const primary = fields.find((field) => {
		if (!isRecord(field) || typeof field.field !== 'string' || !isRecord(field.schema))
			return false
		return field.schema.is_primary_key === true
	})
	return isRecord(primary) && typeof primary.field === 'string' ? primary.field : 'id'
}

/**
 * Recalculates configured derived fields in bounded pages.
 * @param options - Operation input.
 * @param context - Directus operation context.
 * @returns Bounded recalculation statistics.
 */
export default defineOperationApi<RecalculateOptions>({
	id: 'sluggernaut-recalculate',
	/**
	 * Recalculates configured derived fields in bounded pages.
	 * @param options - Operation input.
	 * @param context - Directus operation context.
	 * @returns Bounded recalculation statistics.
	 */
	handler: async (options, context) => {
		const { collection, createRedirects } = options
		if (typeof collection !== 'string' || collection.trim() === '') {
			throw new Error('Sluggernaut recalculation requires a collection.')
		}
		if (
			options.fieldKeys !== undefined &&
			(!Array.isArray(options.fieldKeys) ||
				options.fieldKeys.some((field) => typeof field !== 'string' || field.trim() === ''))
		) {
			throw new Error('Sluggernaut recalculation fieldKeys must be a string array.')
		}

		const setup = extensionSetup(EXTENSION_NAME, context.env, context.logger)
		setup.start()
		if (!setup.isEnabled()) return { processed: 0, updated: 0, skipped: 0, failed: 0 }

		const envOptions = validateExtensionOptions(context.env, envSchema, context.logger)
		const schema = await context.getSchema()
		const fieldsService = new context.services.ItemsService('directus_fields', {
			schema,
			accountability: null,
			knex: context.database,
		})
		const fields = await fieldsService.readByQuery({
			filter: { collection: { _eq: collection } },
			fields: ['field', 'meta', 'schema'],
			limit: -1,
		})
		const configuration = discoverCollectionConfiguration(fields)
		const primaryKey = primaryKeyFromFields(fields)
		const fieldKeys = selectedFieldKeys(options, configuration)
		const result: RecalculateResult = { processed: 0, updated: 0, skipped: 0, failed: 0 }
		if (fieldKeys.size === 0) {
			setup.end()
			return result
		}

		const itemsService = new context.services.ItemsService(collection, {
			schema,
			accountability: null,
			knex: context.database,
		})

		for (let offset = 0; ; offset += PAGE_SIZE) {
			const items = await itemsService.readByQuery({
				fields: ['*'],
				limit: PAGE_SIZE,
				offset,
				sort: [primaryKey],
			})
			if (!Array.isArray(items) || items.length === 0) break

			for (const item of items) {
				result.processed += 1
				const itemKey = isRecord(item) ? item[primaryKey] : undefined
				if (
					!isRecord(item) ||
					(typeof itemKey !== 'string' && typeof itemKey !== 'number')
				) {
					result.failed += 1
					context.logger.warn('Sluggernaut skipped an item without a scalar id.', {
						collection,
						code: 'recalculate-invalid-item',
					})
					continue
				}

				try {
					const mutation = coordinateMutation({
						kind: 'recalculate',
						payload: {},
						existingItem: item,
						configuration,
						fieldKeys,
					})
					const updates = Object.fromEntries(
						Object.entries(mutation.payload).filter(([field]) => fieldKeys.has(field)),
					)
					if (Object.keys(updates).length === 0) {
						result.skipped += 1
						continue
					}

					if (createRedirects && envOptions.SLUGGERNAUT_REDIRECTS_ENABLED) {
						await itemsService.updateOne(itemKey, updates)
					} else {
						await context
							.database(collection)
							.where(primaryKey, itemKey)
							.update(updates)
					}
					result.updated += 1
				} catch (error: unknown) {
					result.failed += 1
					context.logger.warn('Sluggernaut failed to recalculate an item.', {
						collection,
						item: String(itemKey),
						error: error instanceof Error ? error.message : String(error),
						code: 'recalculate-item-failed',
					})
				}
			}

			if (items.length < PAGE_SIZE) break
		}

		setup.end()
		return result
	},
})
