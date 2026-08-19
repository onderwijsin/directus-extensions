import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'

import { coolifyEnvironmentSchema } from '../shared/schemas'

/**
 * Validates environment values used by the Coolify deployments endpoint.
 * @returns The endpoint environment schema.
 */
export const envSchema = directusStartupSchema.extend(coolifyEnvironmentSchema.shape)
