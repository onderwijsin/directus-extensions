import { describe, expect, it } from 'vitest'

import { createStartupLockProvider } from '../src/server/directus-ensure/provider'

describe('createStartupLockProvider', () => {
	it('creates the configured memory provider', async () => {
		const resource = createStartupLockProvider({
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
			DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'MEMORY',
			DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'memory',
			REDIS_ENABLED: false,
		})
		const lease = await resource.provider.tryAcquire('test')

		expect(lease).not.toBeNull()
		await lease?.release()
		await resource.dispose()
	})
})
