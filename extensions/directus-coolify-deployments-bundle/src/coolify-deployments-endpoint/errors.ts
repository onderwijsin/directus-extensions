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

export const CoolifyDeploymentApplicationMismatchError = createError(
	'COOLIFY_DEPLOYMENT_APPLICATION_MISMATCH',
	'The deployment does not belong to the requested application',
	403,
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
