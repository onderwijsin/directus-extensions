import type { PolicyAccessRow } from './fetch-policies'

import { ipInNetworks } from '@directus/utils/node'

/**
 * Keeps policies whose IP allow list permits the current request.
 *
 * @param policies - Access rows returned by Directus.
 * @param ip - Client IP address from the current accountability.
 * @returns Access rows effective for the client IP.
 */
export function filterPoliciesByIp(
	policies: PolicyAccessRow[],
	ip: string | null | undefined,
): PolicyAccessRow[] {
	return policies.filter(({ policy }) => {
		if (!policy.ip_access || policy.ip_access.length === 0) return true
		if (!ip) return false

		return ipInNetworks(ip, policy.ip_access)
	})
}
