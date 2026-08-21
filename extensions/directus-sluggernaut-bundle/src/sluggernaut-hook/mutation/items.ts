import type { EventContext, HookExtensionContext } from '@directus/types'
import type { CollectionConfiguration } from '../../shared/configuration/types'

import { hasKey, isArray, isRecord } from '@onderwijsin/directus-extension-utils'

/**
 * Collects the minimum field set required by the mutation coordinator.
 * @param configuration - Parsed collection configuration.
 * @returns Deduplicated field keys required by mutation processing.
 */
export function relevantFields(configuration: CollectionConfiguration): string[] {
	return [
		...new Set([
			...configuration.slugs.flatMap((field) => [field.field, ...field.options.sourceFields]),
			...configuration.permalinks.flatMap((field) => [
				field.field,
				...(field.options.slugField ? [field.options.slugField] : []),
			]),
		]),
	]
}

/**
 * Checks whether the payload can affect a Sluggernaut-derived value.
 * @param payload - Incoming mutation payload.
 * @param configuration - Parsed collection configuration.
 * @returns Whether a relevant field is present.
 */
export function hasRelevantPayloadField(
	payload: Readonly<Record<string, unknown>>,
	configuration: CollectionConfiguration,
): boolean {
	return relevantFields(configuration).some((field) => hasKey(payload, field))
}

/**
 * Reads only fields required for the current derivation.
 * @param context - Directus extension context.
 * @param collection - Directus collection key.
 * @param key - Item primary key.
 * @param fields - Required field keys.
 * @param eventContext - Directus event context.
 * @returns Existing item values.
 */
export async function readExistingItem(
	context: HookExtensionContext,
	collection: string,
	key: string | number,
	fields: readonly string[],
	eventContext: EventContext,
): Promise<Record<string, unknown>> {
	const schema = await context.getSchema()
	const itemsService = new context.services.ItemsService(collection, {
		schema,
		accountability: eventContext.accountability,
		knex: eventContext.database,
	})
	const item = await itemsService.readOne(key, { fields: [...new Set(fields)] })
	if (!isRecord(item)) throw new Error('Sluggernaut could not read the existing item.')
	return item
}

/**
 * Resolves the only supported item key for an update mutation.
 * @param value - Directus mutation keys.
 * @returns A scalar item key.
 */
export function singleItemKey(value: unknown): string | number {
	if (!isArray(value)) throw new Error('Sluggernaut requires a scalar item key for updates.')
	if (value.length > 1) {
		throw new Error('Sluggernaut cannot derive or archive items in an ambiguous bulk mutation.')
	}
	const key = value[0]
	if (typeof key !== 'string' && typeof key !== 'number') {
		throw new Error('Sluggernaut requires a scalar item key for updates.')
	}
	return key
}
