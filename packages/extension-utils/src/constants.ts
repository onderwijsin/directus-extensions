/**
 * Environments in which Directus can be deployed
 */
export const deploymentEnvs = ['development', 'staging', 'production'] as const

export type DEPLOYMENT_ENV = (typeof deploymentEnvs)[number]
