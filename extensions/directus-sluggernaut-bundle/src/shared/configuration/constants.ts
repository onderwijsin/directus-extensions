/** Stable extension identifier used by lifecycle and startup helpers. */
export const EXTENSION_NAME = 'sluggernaut'

/** Directus entry IDs for Sluggernaut's two field interfaces. */
export const INTERFACE_IDS = {
	slug: 'sluggernaut-slug',
	permalink: 'sluggernaut-permalink',
} as const

/** Stable Directus policy identifiers provisioned by Sluggernaut. */
export const POLICY_IDS = {
	manageRedirects: '1f1b6f8a-c0aa-4d9b-9c75-7d6ef3b8a101',
	readActiveRedirects: '7a5c9e2f-38e1-4d76-9d38-0a4ce0a3b202',
} as const
