import pino from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { extensionSetup, validateExtensionOptions } from '../src/server/setup'

describe('extension setup utilities', () => {
	afterEach(() => vi.restoreAllMocks())

	it('logs extension startup and completion', () => {
		const logger = pino({ enabled: false })
		const info = vi.spyOn(logger, 'info')
		const setup = extensionSetup('catalog', {}, logger)

		setup.start()
		setup.end()

		expect(info).toHaveBeenNthCalledWith(1, '🔌 Loading extension catalog')
		expect(info).toHaveBeenNthCalledWith(2, '✅ Extension catalog Loaded')
	})

	it('disables an extension when its enabled environment variable is false', () => {
		const logger = pino({ enabled: false })
		const info = vi.spyOn(logger, 'info')
		const setup = extensionSetup('catalog', { CATALOG_ENABLED: 'false' }, logger)

		expect(setup.isEnabled()).toBe(false)
		expect(info).toHaveBeenCalledWith(
			'⛔️ Extension catalog is disabled via its "CATALOG_ENABLED" environment variable. Skipping setup...',
		)
	})

	it('treats a missing or boolean true enabled value as enabled', () => {
		const logger = pino({ enabled: false })

		expect(extensionSetup('catalog', {}, logger).isEnabled()).toBe(true)
		expect(extensionSetup('catalog', { CATALOG_ENABLED: true }, logger).isEnabled()).toBe(true)
	})

	it('returns parsed extension options for a valid schema', () => {
		const logger = pino({ enabled: false })
		const schema = z.object({ CATALOG_ENABLED: z.boolean(), CATALOG_URL: z.url() })
		const options = validateExtensionOptions(
			{ CATALOG_ENABLED: true, CATALOG_URL: 'https://example.com' },
			schema,
			logger,
		)

		expect(options).toEqual({
			CATALOG_ENABLED: true,
			CATALOG_URL: 'https://example.com',
		})
	})

	it('logs and throws when extension options are invalid', () => {
		const logger = pino({ enabled: false })
		const info = vi.spyOn(logger, 'info')
		const schema = z.object({ CATALOG_ENABLED: z.boolean() })

		expect(() => validateExtensionOptions({ CATALOG_ENABLED: 'yes' }, schema, logger)).toThrow(
			'Invalid extension options ☝. Exiting.',
		)
		expect(info).toHaveBeenCalledOnce()
		expect(info.mock.calls[0]?.[0]).toContain('Invalid input')
	})
})
