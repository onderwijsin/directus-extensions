import { describe, expect, it } from 'vitest'

import { envSchema as endpointEnvSchema } from '../src/magic-links-endpoint/env.schema'
import { envSchema as hookEnvSchema } from '../src/magic-links-hook/env.schema'

describe('magic-links scaffold', () => {
	it('enables both API entries by default', () => {
		expect(endpointEnvSchema.parse({}).MAGIC_LINKS_ENABLED).toBe(true)
		expect(hookEnvSchema.parse({}).MAGIC_LINKS_ENABLED).toBe(true)
	})
})
