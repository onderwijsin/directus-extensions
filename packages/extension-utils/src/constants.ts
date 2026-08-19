import type { Accountability } from '@directus/types'

/**
 * Environments in which Directus can be deployed
 */
export const deploymentEnvs = ['development', 'staging', 'production'] as const

export type DEPLOYMENT_ENV = (typeof deploymentEnvs)[number]

/**
 * Creates an accountability object with admin permissions.
 * @returns A fresh admin accountability object.
 */
export function createAdminAccountability(): Accountability {
	return {
		role: null,
		roles: [],
		user: null,
		admin: true,
		app: false,
		ip: null,
	}
}

/**
 * Creates an admin accountability object for system-owned operations.
 * @returns A fresh system admin accountability object.
 */
export function createSystemAdminAccountability(): Accountability & { user: 'system' } {
	return {
		...createAdminAccountability(),
		user: 'system',
	}
}
