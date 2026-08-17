/**
 * Environments in which Directus can be deployed
 */
export const deploymentEnvs = ['development', 'staging', 'production'] as const

export type DEPLOYMENT_ENV = (typeof deploymentEnvs)[number]

export interface Accountability {
	role: string | null
	roles: string[]
	user: string | null
	admin: boolean
	app: boolean
	ip: string | null
	share?: string
	userAgent?: string
	origin?: string
	session?: string
	oauth?: {
		client: string
		scopes: string[]
		aud: string[]
	}
}

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
