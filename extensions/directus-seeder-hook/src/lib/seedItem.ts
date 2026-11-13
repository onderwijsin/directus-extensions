import { isRecord } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

/** Directus accepts string and numeric primary keys. */
export type PrimaryKey = string | number

/** Legacy seed arrays accept every JSON value without filtering individual rows. */
export type SeedItem = unknown

/** Validate the array boundary without transforming, stripping, or validating its members. */
export const seedItemsSchema = z.array(z.unknown())

/**
 * Reads a seed row's enumerable properties without changing the stored seed value.
 * Primitive rows retain JavaScript's property-access behavior; nullish rows still fail.
 * @param item - A value from a legacy seed array.
 * @returns Properties available to the collection-specific processor.
 */
export function toSeedRecord(item: SeedItem): Record<string, unknown> {
	if (item === null || item === undefined) {
		throw new TypeError('Cannot read properties of a null or undefined seed item')
	}
	if (isRecord(item)) return item
	return Object.fromEntries(Object.entries(item))
}

/**
 * Reads a string field only when the seed row supplies a string.
 * @param item - Seed row being inspected.
 * @param field - Property to inspect.
 * @returns The string field, or undefined for a nullish value.
 */
export function getStringField(item: SeedItem, field: string): string | undefined {
	const value = toSeedRecord(item)[field]
	if (value === undefined || value === null) return undefined
	if (typeof value !== 'string') throw new TypeError(`${field}.toLowerCase is not a function`)
	return value
}
