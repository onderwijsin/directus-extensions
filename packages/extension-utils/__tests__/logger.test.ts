import pino from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLogger } from '../src/server'

describe('logger utilities', () => {
	afterEach(() => vi.restoreAllMocks())

	it('preserves the supplied logger methods', () => {
		const supplied = pino({ enabled: false })
		const info = vi.spyOn(supplied, 'info')
		const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
		const logger = createLogger(supplied)

		expect(logger).toBe(supplied)
		logger.info({ msg: 'message', operation: 'test' })

		expect(info).toHaveBeenCalledWith({ msg: 'message', operation: 'test' })
		expect(consoleLog).not.toHaveBeenCalled()
	})

	it('provides a console-backed fallback', () => {
		const info = vi.spyOn(console, 'log').mockImplementation(() => undefined)

		createLogger().info('fallback')

		expect(info).toHaveBeenCalledWith('fallback')
	})
})
