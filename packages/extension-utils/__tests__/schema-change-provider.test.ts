import { describe, expect, it } from 'vitest'

import { createSchemaChangeLockProvider } from '../src/server/schema-management/provider'

describe('createSchemaChangeLockProvider', () => {
	it('creates the configured memory provider', async () => {
		const resource = createSchemaChangeLockProvider({
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'MEMORY',
			DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'memory',
		})
		const lease = await resource.provider.tryAcquire('test')

		expect(lease).not.toBeNull()
		await lease?.release()
		await resource.dispose()
	})
})
