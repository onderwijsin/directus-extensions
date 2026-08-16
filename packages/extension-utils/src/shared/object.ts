/**
 * Returns an object's own enumerable string-keyed entries with typed keys and values.
 *
 * @param value - The object whose entries should be returned.
 * @returns Typed key/value pairs from the object.
 */
export function toEntries<T extends object>(value: T): [keyof T, T[keyof T]][] {
	return Object.entries(value) as [keyof T, T[keyof T]][]
}

/**
 * Creates an object from typed key/value entries.
 *
 * @param entries - The key/value pairs to combine into an object.
 * @returns An object indexed by the entry keys and containing their values.
 */
export function fromEntries<K extends PropertyKey, V>(
	entries: Iterable<readonly [K, V]>,
): Record<K, V> {
	return Object.fromEntries(entries) as Record<K, V>
}

/**
 * Returns an object's own enumerable string-keyed keys with the object's key type.
 *
 * @param value - The object whose keys should be returned.
 * @returns The object's keys typed as `keyof T`.
 */
export function keys<T extends object>(value: T): (keyof T)[] {
	return Object.keys(value) as (keyof T)[]
}
