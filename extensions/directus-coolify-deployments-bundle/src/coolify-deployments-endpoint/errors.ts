import { createError } from '@directus/errors'

export const CoolifyUpstreamError = createError(
	'COOLIFY_UPSTREAM_FAILED',
	'Coolify request failed',
	502,
)

export const CoolifyDeploymentApplicationMismatchError = createError(
	'COOLIFY_DEPLOYMENT_APPLICATION_MISMATCH',
	'The deployment does not belong to the requested application',
	403,
)
