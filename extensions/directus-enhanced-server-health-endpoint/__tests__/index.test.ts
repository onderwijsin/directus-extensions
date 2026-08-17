import { describe, expect, it } from 'vitest'

import { envSchema } from '../src/env.schema'
import { getHealthStatus, type HealthComponent, type HealthStatus } from '../src/health'

const options = (overrides: Record<string, unknown> = {}) => envSchema.parse(overrides)

const component = (
	status: HealthStatus,
	componentType: HealthComponent['componentType'] = 'datastore',
): HealthComponent => ({
	status,
	componentType,
})

describe('enhanced server health status', () => {
	it('returns ok when no selected component is unhealthy', () => {
		expect(
			getHealthStatus(
				{ database: [component('ok')], cache: [component('warn', 'cache')] },
				options(),
			),
		).toBe('ok')
	})

	it('applies warning exposure and error precedence', () => {
		const checks = {
			database: [component('warn')],
			cache: [component('error', 'cache')],
		}

		expect(getHealthStatus(checks, options({ HEALTHCHECK_EXPOSE_WARNING_STATUS: true }))).toBe(
			'error',
		)
		expect(
			getHealthStatus(
				{ database: [component('warn')] },
				options({ HEALTHCHECK_EXPOSE_WARNING_STATUS: true }),
			),
		).toBe('warn')
	})

	it('requires checks and components to be included and not excluded', () => {
		const checks = {
			database: [component('error')],
			cache: [component('error', 'cache')],
		}

		expect(
			getHealthStatus(
				checks,
				options({
					HEALTHCHECK_INCLUDE_CHECKS: ['database'],
					HEALTHCHECK_EXCLUDE_CHECKS: ['database'],
				}),
			),
		).toBe('ok')
		expect(
			getHealthStatus(checks, options({ HEALTHCHECK_EXCLUDE_COMPONENTS: ['cache'] })),
		).toBe('error')
	})

	it('supports wildcard check inclusion and exclusion', () => {
		const checks = { database: [component('error')] }

		expect(getHealthStatus(checks, options({ HEALTHCHECK_INCLUDE_CHECKS: ['*'] }))).toBe(
			'error',
		)
		expect(getHealthStatus(checks, options({ HEALTHCHECK_EXCLUDE_CHECKS: ['*'] }))).toBe('ok')
	})
})

describe('enhanced server health configuration', () => {
	it('provides documented defaults', () => {
		expect(envSchema.parse({})).toEqual({
			ENHANCED_SERVER_HEALTH_ENDPOINT_ENABLED: true,
			HEALTHCHECK_INCLUDE_CHECKS: ['*'],
			HEALTHCHECK_EXCLUDE_CHECKS: [],
			HEALTHCHECK_INCLUDE_COMPONENTS: [
				'datastore',
				'cache',
				'objectstore',
				'email',
				'unknown',
			],
			HEALTHCHECK_EXCLUDE_COMPONENTS: [],
			HEALTHCHECK_EXPOSE_WARNING_STATUS: false,
		})
	})
})
