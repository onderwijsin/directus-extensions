import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLogger } from '../src/index'

describe('logger utilities', () => {
	afterEach(() => vi.restoreAllMocks())

	it('preserves the supplied logger methods', () => {
		const info = vi.fn()
		const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
		const logger = createLogger({ info })

		logger.info('message', { operation: 'test' })

		expect(info).toHaveBeenCalledWith('message', { operation: 'test' })
		expect(consoleInfo).not.toHaveBeenCalled()
	})

	it('provides a console-backed fallback', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

		createLogger().info('fallback')

		expect(info).toHaveBeenCalledWith('fallback', undefined)
	})

	it('falls back independently for missing logger methods', () => {
		const trace = vi.spyOn(console, 'trace').mockImplementation(() => undefined)
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
		const logger = createLogger({})

		logger.trace?.('trace')
		logger.debug?.('debug')
		logger.warn('warn')
		logger.error('error')

		expect(trace).toHaveBeenCalledWith('trace', undefined)
		expect(debug).toHaveBeenCalledWith('debug', undefined)
		expect(warn).toHaveBeenCalledWith('warn', undefined)
		expect(error).toHaveBeenCalledWith('error', undefined)
	})

	it('preserves the receiver of supplied logger methods', () => {
		const supplied = {
			prefix: 'before',
			info(message: string) {
				this.prefix = message
			},
		}

		createLogger(supplied).info('after')

		expect(supplied.prefix).toBe('after')
	})
})
