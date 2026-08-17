import type { z } from 'zod'

import { toEntries } from '@onderwijsin/directus-extension-utils'

import { envSchema } from './env.schema'
import { serverHealthSchema } from './healthcheck.schema'

type HealthChecks = z.infer<typeof serverHealthSchema>['checks']
type HealthOptions = z.infer<typeof envSchema>
export type HealthComponent = HealthChecks[string][number]
export type HealthStatus = HealthComponent['status']

/**
 * Calculates the public status from the selected Directus health components.
 *
 * Check and component exclusions take precedence over their corresponding inclusions.
 * @param checks - Directus health checks grouped by check name.
 * @param options - Validated extension configuration.
 * @returns The status exposed by the endpoint.
 */
export function getHealthStatus(checks: HealthChecks, options: HealthOptions) {
	let status: 'ok' | 'warn' | 'error' = 'ok'

	for (const [check, components] of toEntries(checks)) {
		const isCheckExcluded =
			options.HEALTHCHECK_EXCLUDE_CHECKS.includes('*') ||
			options.HEALTHCHECK_EXCLUDE_CHECKS.includes(check)
		const isCheckIncluded =
			options.HEALTHCHECK_INCLUDE_CHECKS.includes('*') ||
			options.HEALTHCHECK_INCLUDE_CHECKS.includes(check)

		if (isCheckExcluded || !isCheckIncluded) continue

		for (const component of components) {
			const isExcluded = options.HEALTHCHECK_EXCLUDE_COMPONENTS.includes(
				component.componentType,
			)
			const isIncluded = options.HEALTHCHECK_INCLUDE_COMPONENTS.includes(
				component.componentType,
			)

			if (isExcluded || !isIncluded) continue
			if (component.status === 'error') status = 'error'
			if (
				status !== 'error' &&
				options.HEALTHCHECK_EXPOSE_WARNING_STATUS &&
				component.status === 'warn'
			) {
				status = 'warn'
			}
		}
	}

	return status
}
