import { attemptSync } from '@onderwijsin/directus-extension-utils'

/** Converts stored Sluggernaut values into safe display links. */
import { normalizeHost, normalizePermalink } from '../shared/values/normalization'

/**
 * Normalizes a display value into an absolute path.
 * @param value - Stored slug or permalink.
 * @returns A normalized path, or null for an empty value.
 */
export function displayPath(value: string | null | undefined): string | null {
	if (value === null || value === undefined || value.trim() === '') return null
	const trimmed = value.trim()
	const candidate = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
	const result = attemptSync(() => normalizePermalink(candidate))
	return result.error === null ? result.data : null
}

/**
 * Validates an optional display host.
 * @param host - Configured host value.
 * @returns A normalized HTTP(S) origin, or null when invalid or absent.
 */
export function displayHost(host: string | null | undefined): string | null {
	if (host === null || host === undefined || host.trim() === '') return null
	const result = normalizeHost(host)
	return result.error === null && result.host !== '' ? result.host : null
}

/**
 * Builds an optional absolute link for a display value.
 * @param value - Stored slug or permalink.
 * @param host - Optional HTTP(S) origin.
 * @returns An absolute URL, or null when no valid host is configured.
 */
export function displayHref(
	value: string | null | undefined,
	host: string | null | undefined,
): string | null {
	const path = displayPath(value)
	const origin = displayHost(host)
	if (path === null || origin === null) return null
	return new URL(path, origin).toString()
}
