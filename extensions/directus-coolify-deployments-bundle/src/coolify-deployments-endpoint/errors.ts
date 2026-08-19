import type { NextFunction } from 'express'

import { createError } from '@directus/errors'
import {
	rejectWhileSchemaLocked as rejectSchemaWhileLocked,
	type DirectusStartupStatusOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_ID } from '../shared/constants'

export const SchemaLockedError = createError(
	'COOLIFY_SCHEMA_LOCKED',
	'Coolify deployments are unavailable while schema changes are in progress',
	503,
)

export const SchemaStatusError = createError(
	'COOLIFY_SCHEMA_STATUS_FAILED',
	'Unable to determine whether Coolify deployment schema changes are in progress',
	503,
)

export const CoolifyUpstreamError = createError(
	'COOLIFY_UPSTREAM_FAILED',
	'Coolify request failed',
	502,
)

export const UnknownCoolifyProjectError = createError(
	'COOLIFY_PROJECT_NOT_FOUND',
	'Unknown Coolify project',
	404,
)

export const InvalidDeploymentRequestError = createError(
	'COOLIFY_INVALID_DEPLOYMENT_REQUEST',
	'Invalid deployment request',
	400,
)

export const NotImplemented = createError(
	'COOLIFY_NOT_IMPLEMENTED',
	'Coolify deployment routes are not implemented yet',
	501,
)

/**
 * Forward a schema-lock error when this endpoint's schema is being changed.
 * @param options - Startup status options for this extension.
 * @param next - Express error handler continuation.
 * @returns Whether the request was rejected.
 */
export async function rejectWhileSchemaLocked(
	options: DirectusStartupStatusOptions,
	next: NextFunction,
): Promise<boolean> {
	return rejectSchemaWhileLocked(
		{
			id: EXTENSION_ID,
			options,
			errors: {
				locked: SchemaLockedError,
				status: SchemaStatusError,
			},
		},
		next,
	)
}
