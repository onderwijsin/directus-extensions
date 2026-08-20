import { describe, expect, it } from 'vitest'

import { INTERFACE_IDS } from '../src/shared/configuration/constants'
import { envSchema } from '../src/sluggernaut-hook/configuration/env.schema'

describe('Sluggernaut bundle scaffold', () => {
	it('uses the V2 interface identifiers', () => {
		expect(INTERFACE_IDS).toEqual({
			slug: 'sluggernaut-slug',
			permalink: 'sluggernaut-permalink',
		})
	})

	it('provides the documented environment defaults', () => {
		expect(envSchema.parse({})).toMatchObject({
			SLUGGERNAUT_ENABLED: true,
			SLUGGERNAUT_REDIRECTS_ENABLED: false,
			SLUGGERNAUT_REDIRECTS_COLLECTION: 'redirects',
			SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 60_000,
			SLUGGERNAUT_SCHEMA_CHANGES_ENABLED: false,
			SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR: true,
			SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED: false,
			SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED: false,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
		})
	})
})
